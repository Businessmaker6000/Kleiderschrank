// Rule-based outfit generator with transparent scoring.
// It only ever combines pieces from the list it is given (one profile's wardrobe).
//
// Approach: sample many candidate combinations, score each on colour harmony, style,
// weather, occasion, season, formality, favourites and freshness, then pick among the best.
import {
  COLOR_BY_ID,
  DEFAULT_META,
  MATERIAL_WARMTH,
  OCCASIONS,
  SLOTS,
  STYLE_AFFINITY,
  TYPE_META,
  colorPairScore,
  seasonForMonth,
} from '../taxonomy.ts';
import type { Season, Slot, TypeMeta } from '../taxonomy.ts';
import type { Item } from '../types.ts';

export type Selection = Partial<Record<Slot, string>>;
export type Mode = 'random' | 'style' | 'weather' | 'occasion' | 'around' | 'surprise';

export interface WeatherInput {
  temp: number;
  feels: number;
  rainProb: number;
  wind: number;
  code: number;
}

export interface GenOptions {
  mode: Mode;
  style?: string | null;
  occasion?: string | null;
  weather?: WeatherInput | null;
  season?: Season;
  /** slots that must keep their piece */
  locked?: Selection;
  /** the outfit currently shown — the generator tries to return something different */
  current?: Selection;
  /** saved outfits (item ids + how often worn) to keep suggestions fresh */
  history?: { ids: string[]; worn: number }[];
  favoriteStyles?: string[];
  rng?: () => number;
}

export interface ScorePart {
  key: string;
  label: string;
  /** 0…1 */
  value: number;
  weight: number;
}

export interface Generated {
  selection: Selection;
  score: number;
  parts: ScorePart[];
  explanation: string;
}

// ---------- helpers ----------

export function seededRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function metaOf(item: Item): TypeMeta {
  return TYPE_META[item.type] || DEFAULT_META;
}

export function warmthOf(item: Item): number {
  return Math.max(0, metaOf(item).warmth + (item.material ? MATERIAL_WARMTH[item.material] || 0 : 0));
}

export function candidatesFor(items: Item[], slot: Slot): Item[] {
  return items.filter((i) => i.slot === slot).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

/** Arrow navigation: the next / previous piece for one slot. */
export function cycleSlot(items: Item[], selection: Selection, slot: Slot, dir: 1 | -1): Selection {
  const list = candidatesFor(items, slot);
  if (!list.length) return selection;
  const idx = list.findIndex((i) => i.id === selection[slot]);
  const next = idx === -1 ? (dir === 1 ? 0 : list.length - 1) : (idx + dir + list.length) % list.length;
  return { ...selection, [slot]: list[next].id };
}

export function isWet(w: WeatherInput): boolean {
  return w.rainProb >= 50 || (w.code >= 51 && w.code <= 67) || (w.code >= 80 && w.code <= 99);
}

const SEASON_FEELS: Record<Season, number> = { Winter: 3, Frühling: 13, Sommer: 24, Herbst: 11 };

function avg(xs: number[], empty = 0.6): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : empty;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function pairs<T>(xs: T[]): [T, T][] {
  const out: [T, T][] = [];
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) out.push([xs[i], xs[j]]);
  return out;
}

function styleLink(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0.6;
  if (a.some((s) => b.includes(s))) return 1;
  if (a.some((s) => (STYLE_AFFINITY[s] || []).some((t) => b.includes(t)))) return 0.7;
  return 0.25;
}

function matchesStyle(item: Item, style: string): number {
  if (item.styles.includes(style)) return 1;
  if (!item.styles.length) return 0.45;
  if (item.styles.some((s) => (STYLE_AFFINITY[style] || []).includes(s))) return 0.65;
  return 0.15;
}

// ---------- scoring ----------

const CORE: Slot[] = ['top', 'bottom', 'dress', 'outerwear', 'shoes'];

export function scoreOutfit(chosen: Item[], opts: GenOptions): { total: number; parts: ScorePart[] } {
  const core = chosen.filter((i) => CORE.includes(i.slot));
  const season = opts.season || seasonForMonth(new Date().getMonth());
  const parts: ScorePart[] = [];

  // colour harmony — main colour of every piece against every other
  const mains = chosen.map((i) => i.colors[0]).filter(Boolean);
  let color = avg(pairs(mains).map(([a, b]) => colorPairScore(a, b)), 0.7);
  const loud = new Set(mains.filter((c) => COLOR_BY_ID[c] && !COLOR_BY_ID[c].neutral && !COLOR_BY_ID[c].earth));
  if (loud.size > 2) color -= 0.15 * (loud.size - 2);
  const patterned = chosen.filter((i) => i.pattern && i.pattern !== 'Uni' && i.pattern !== 'Strukturiert').length;
  if (patterned > 1) color -= 0.12 * (patterned - 1);
  parts.push({ key: 'color', label: 'Farbharmonie', value: clamp01(color), weight: 0.28 });

  // style cohesion between the pieces themselves
  parts.push({
    key: 'cohesion',
    label: 'Stil-Zusammenhalt',
    value: avg(pairs(core).map(([a, b]) => styleLink(a.styles, b.styles)), 0.6),
    weight: 0.16,
  });

  // formality spread: a blazer with joggers scores low
  const forms = core.map((i) => metaOf(i).formality);
  const spread = forms.length ? Math.max(...forms) - Math.min(...forms) : 0;
  parts.push({ key: 'formality', label: 'Formalität', value: [1, 1, 0.7, 0.35, 0.1][Math.min(4, spread)], weight: 0.1 });

  if (opts.style) {
    parts.push({
      key: 'style',
      label: `Stil ${opts.style}`,
      value: avg(core.map((i) => matchesStyle(i, opts.style!))),
      weight: opts.mode === 'style' ? 0.4 : 0.25,
    });
  } else if (opts.favoriteStyles?.length) {
    parts.push({
      key: 'taste',
      label: 'Dein Stil',
      value: avg(core.map((i) => Math.max(...opts.favoriteStyles!.map((s) => matchesStyle(i, s))))),
      weight: 0.08,
    });
  }

  if (opts.occasion) {
    const occ = OCCASIONS.find((o) => o.id === opts.occasion);
    if (occ) {
      const value = avg(
        core.map((i) => {
          const m = metaOf(i);
          if (occ.sport) return m.sport || i.styles.includes('Sporty') ? 1 : 0.15;
          const style = !i.styles.length ? 0.55 : i.styles.some((s) => occ.styles.includes(s)) ? 1 : 0.35;
          const dist = m.formality < occ.formality[0] ? occ.formality[0] - m.formality : m.formality > occ.formality[1] ? m.formality - occ.formality[1] : 0;
          return style * 0.5 + [1, 0.65, 0.3, 0.1, 0.05][Math.min(4, dist)] * 0.5;
        }),
      );
      parts.push({ key: 'occasion', label: `Anlass ${occ.id}`, value, weight: opts.mode === 'occasion' ? 0.4 : 0.25 });
    }
  }

  // weather (or the season as a stand-in when no live weather is available)
  const w = opts.weather;
  const feels = w ? w.feels : SEASON_FEELS[season];
  const by = (slot: Slot) => chosen.find((i) => i.slot === slot);
  const upper = by('top') || by('dress');
  const need = clamp01((25 - feels) / 3.6 / 8) * 8 + (w && w.wind > 30 ? 0.4 : 0);
  const have =
    (upper ? warmthOf(upper) * 0.6 : 0) +
    (by('outerwear') ? warmthOf(by('outerwear')!) * 0.8 : 0) +
    (by('bottom') ? warmthOf(by('bottom')!) * 0.2 : by('dress') ? 0.3 : 0) +
    (by('shoes') ? warmthOf(by('shoes')!) * 0.15 : 0);
  let weather = 1 - Math.min(1, Math.abs(have - need) / 3);
  for (const i of chosen) {
    const m = metaOf(i);
    if (m.summer && feels < 12) weather -= 0.3;
    if (m.winter && feels > 18) weather -= 0.3;
  }
  if (w && isWet(w)) {
    const shoeRain = by('shoes') ? metaOf(by('shoes')!).rain || 0 : 0;
    const outerRain = by('outerwear') ? metaOf(by('outerwear')!).rain || 0 : 0;
    if (shoeRain < 0) weather -= 0.4;
    if (shoeRain > 0) weather += 0.2;
    if (outerRain > 0) weather += 0.3;
    if (!by('outerwear') && feels < 22) weather -= 0.15;
    // nothing rain-proof at all: clearly worse than a combination with at least one such piece
    if (shoeRain <= 0 && outerRain <= 0) weather -= 0.25;
  }
  parts.push({
    key: 'weather',
    label: w ? 'Wetter' : 'Jahreszeit (Temperatur)',
    value: clamp01(weather),
    weight: w ? (opts.mode === 'weather' ? 0.45 : 0.3) : 0.12,
  });

  // season tags set by the user
  parts.push({
    key: 'season',
    label: 'Saison',
    value: avg(chosen.map((i) => (!i.seasons.length ? 0.7 : i.seasons.includes(season) ? 1 : 0.15))),
    weight: 0.1,
  });

  parts.push({ key: 'favorites', label: 'Lieblingsstücke', value: avg(chosen.map((i) => (i.favorite ? 1 : 0.4))), weight: 0.05 });

  // freshness: avoid repeating saved / often worn combinations and overused pieces
  const coreIds = core.map((i) => i.id);
  let repeat = 0;
  for (const h of opts.history || []) {
    const overlap = coreIds.filter((id) => h.ids.includes(id)).length;
    if (coreIds.length && overlap === coreIds.length) repeat = Math.max(repeat, Math.min(1, 0.6 + h.worn * 0.1));
  }
  const maxWear = Math.max(1, ...chosen.map((i) => i.wear_count));
  const wearLoad = avg(chosen.map((i) => i.wear_count / maxWear), 0);
  parts.push({
    key: 'fresh',
    label: 'Abwechslung',
    value: clamp01(1 - repeat * 0.8 - wearLoad * 0.2),
    weight: opts.mode === 'surprise' ? 0.2 : 0.08,
  });

  const totalWeight = parts.reduce((a, p) => a + p.weight, 0);
  const total = parts.reduce((a, p) => a + p.value * p.weight, 0) / totalWeight;
  return { total, parts };
}

// ---------- generation ----------

function pick<T>(xs: T[], rng: () => number): T {
  return xs[Math.floor(rng() * xs.length)];
}

function sameSelection(a: Selection, b: Selection): boolean {
  return SLOTS.every((s) => (a[s] || null) === (b[s] || null));
}

function outerwearChance(opts: GenOptions, season: Season): number {
  const feels = opts.weather ? opts.weather.feels : SEASON_FEELS[season];
  if (feels < 12) return 1;
  if (opts.weather && isWet(opts.weather) && feels < 24) return 0.85;
  if (feels < 18) return 0.6;
  if (feels < 22) return 0.15;
  return 0;
}

export function generateOutfit(items: Item[], opts: GenOptions): Generated | null {
  if (!items.length) return null;
  const rng = opts.rng || Math.random;
  const season = opts.season || seasonForMonth(new Date().getMonth());
  const byId = new Map(items.map((i) => [i.id, i]));
  const pool = Object.fromEntries(SLOTS.map((s) => [s, candidatesFor(items, s)])) as Record<Slot, Item[]>;

  // locks that still point at existing pieces in the right slot
  const locked: Selection = {};
  for (const s of SLOTS) {
    const id = opts.locked?.[s];
    if (id && byId.get(id)?.slot === s) locked[s] = id;
  }

  const canSeparates = pool.top.length > 0 || pool.bottom.length > 0;
  const canDress = pool.dress.length > 0;
  let dressShare = canDress ? Math.min(0.45, pool.dress.length / (pool.dress.length + Math.max(1, Math.min(pool.top.length, pool.bottom.length)))) : 0;
  if (!canSeparates) dressShare = 1;
  if (locked.dress) dressShare = 1;
  if (locked.top || locked.bottom) dressShare = 0;

  const outerP = outerwearChance(opts, season);
  const accP = opts.mode === 'surprise' ? 0.8 : 0.6;
  const scored: { sel: Selection; total: number; parts: ScorePart[] }[] = [];
  const seen = new Set<string>();

  for (let n = 0; n < 260; n++) {
    const sel: Selection = { ...locked };
    const fill = (slot: Slot, chance = 1) => {
      if (sel[slot] || !pool[slot].length || rng() >= chance) return;
      sel[slot] = pick(pool[slot], rng).id;
    };
    if (rng() < dressShare) fill('dress');
    else {
      fill('top');
      fill('bottom');
    }
    fill('outerwear', outerP);
    fill('shoes');
    fill('accessory', accP);
    fill('bag', 0.4);

    const key = SLOTS.map((s) => sel[s] || '-').join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const chosen = SLOTS.map((s) => sel[s]).filter(Boolean).map((id) => byId.get(id!)!);
    if (!chosen.length) continue;
    const { total, parts } = scoreOutfit(chosen, { ...opts, season });
    scored.push({ sel, total, parts });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.total - a.total);

  // how adventurous the pick is
  const width = opts.mode === 'surprise' ? 24 : opts.mode === 'random' ? 10 : 4;
  let shortlist = scored.slice(0, Math.min(width, scored.length));
  if (opts.current) {
    const different = shortlist.filter((c) => !sameSelection(c.sel, opts.current!));
    if (different.length) shortlist = different;
    else {
      const any = scored.find((c) => !sameSelection(c.sel, opts.current!));
      if (any) shortlist = [any];
    }
  }
  // surprise picks evenly from a wide field; the other modes lean towards the best
  const idx = opts.mode === 'surprise' ? Math.floor(rng() * shortlist.length) : Math.floor(rng() ** 2 * shortlist.length);
  const winner = shortlist[idx];
  const chosen = SLOTS.map((s) => winner.sel[s]).filter(Boolean).map((id) => byId.get(id!)!);
  return { selection: winner.sel, score: winner.total, parts: winner.parts, explanation: explainOutfit(chosen, opts) };
}

// ---------- explanation ----------

const OCCASION_PHRASE: Record<string, string> = {
  Arbeit: 'einen Tag im Büro',
  Freizeit: 'einen entspannten Tag',
  Date: 'ein Date',
  Dinner: 'ein Dinner',
  Event: 'einen besonderen Anlass',
  Sport: 'eine Sporteinheit',
  Reise: 'einen Reisetag',
};

/** One short German sentence on why this outfit fits. */
export function explainOutfit(chosen: Item[], opts: Pick<GenOptions, 'weather' | 'occasion' | 'style'>): string {
  const w = opts.weather;
  const bits: string[] = [];
  if (w) bits.push(`${Math.round(w.temp)} °C`);
  if (opts.occasion && OCCASION_PHRASE[opts.occasion]) bits.push(OCCASION_PHRASE[opts.occasion]);
  else if (!opts.style) {
    const formal = avg(chosen.filter((i) => CORE.includes(i.slot)).map((i) => metaOf(i).formality), 3);
    bits.push(formal >= 3.8 ? 'einen eleganten Auftritt' : formal <= 2.4 ? 'einen entspannten Tag' : 'einen unkomplizierten Tag');
  }
  let text = bits.length ? `Perfekt für ${bits.join(' und ')}.` : 'Eine stimmige Kombination aus deinem Kleiderschrank.';
  if (opts.style) text = bits.length ? `${opts.style} – perfekt für ${bits.join(' und ')}.` : `Ganz im Stil ${opts.style}.`;

  const extra: string[] = [];
  if (w) {
    const outer = chosen.find((i) => i.slot === 'outerwear');
    const shoes = chosen.find((i) => i.slot === 'shoes');
    if (isWet(w)) {
      const dry = (outer && (metaOf(outer).rain || 0) > 0) || (shoes && (metaOf(shoes).rain || 0) > 0);
      extra.push(dry ? 'Wetterfest bei Regen.' : 'Heute kann es regnen – nimm einen Schirm mit.');
    } else if (w.feels < 8 && outer) extra.push('Warm eingepackt mit Layering.');
    else if (w.feels >= 24) extra.push('Leicht und luftig bei Wärme.');
    else if (w.wind > 30) extra.push('Winddicht kombiniert.');
  }
  return [text, ...extra].join(' ');
}

/** Suggested labels for a finished outfit (used as defaults when saving). */
export function describeOutfit(chosen: Item[]): { styles: string[]; season: Season | null } {
  const counts = new Map<string, number>();
  for (const i of chosen) for (const s of i.styles) counts.set(s, (counts.get(s) || 0) + 1);
  const styles = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([s]) => s);
  const seasonCounts = new Map<string, number>();
  for (const i of chosen) for (const s of i.seasons) seasonCounts.set(s, (seasonCounts.get(s) || 0) + 1);
  const top = [...seasonCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  return { styles, season: top && top[1] >= Math.ceil(chosen.length / 2) ? (top[0] as Season) : null };
}
