"use client";

import { Bookmark, ChevronDown, ChevronLeft, ChevronRight, Lock, LockOpen, Plus, Shirt, Shuffle, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { Collage, ItemImage, resolveItems } from "@/components/Collage";
import { ColorDot } from "@/components/ItemForm";
import { SaveOutfitSheet } from "@/components/SaveOutfitSheet";
import { Button, Chip, ChipRow, EmptyState, Group, Sheet, Skeleton, cx } from "@/components/ui";
import { useItems, useMe, useOutfits } from "@/lib/client/api";
import { useWeather } from "@/lib/client/weather";
import { candidatesFor, daypart, describeOutfit, explainOutfit, generateOutfit, scoreOutfit } from "@/lib/outfit/generator";
import type { GenOptions, Mode, Selection } from "@/lib/outfit/generator";
import { COLORS, OCCASIONS, SLOTS, SLOT_LABEL, STYLES, seasonForMonth } from "@/lib/taxonomy";
import type { Slot } from "@/lib/taxonomy";
import type { Item, Outfit } from "@/lib/types";

const MODES: { id: Mode; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "style", label: "Style" },
  { id: "occasion", label: "Occasion" },
  { id: "random", label: "Random" },
  { id: "surprise", label: "Surprise me" },
];

const DRAFT_KEY = "wd:draft";

// height of each compartment: together the rows read like an outfit from head to toe
const ROW_HEIGHT: Record<Slot, string> = {
  head: "h-20",
  outerwear: "h-36",
  layer: "h-32",
  top: "h-32",
  dress: "h-52",
  bottom: "h-40",
  shoes: "h-24",
  accessory: "h-20",
  bag: "h-24",
};

const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const DAYPART_LABEL = { morning: "morgen", day: "nachmittag", evening: "abend", night: "nacht" } as const;

interface Filter {
  style: string | null;
  colors: string[];
  tags: string[];
}
const NO_FILTER: Filter = { style: null, colors: [], tags: [] };

function matchesFilter(item: Item, f: Filter): boolean {
  if (f.style && !item.styles.includes(f.style)) return false;
  if (f.colors.length && !f.colors.some((c) => item.colors.includes(c))) return false;
  if (f.tags.length && !f.tags.some((t) => item.tags.includes(t))) return false;
  return true;
}

export default function CreatePage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-md" />}>
      <Builder />
    </Suspense>
  );
}

function Builder() {
  const params = useSearchParams();
  const router = useRouter();
  const { items } = useItems();
  const { outfits } = useOutfits();
  const { data: me } = useMe();
  const { weather, status: weatherStatus } = useWeather();

  const [sel, setSel] = useState<Selection>({});
  const [locked, setLocked] = useState<Partial<Record<Slot, boolean>>>({});
  const [active, setActive] = useState<Slot | null>(null);
  const [mode, setMode] = useState<Mode>("auto");
  const [style, setStyle] = useState<string | null>(null);
  const [occasion, setOccasion] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [editing, setEditing] = useState<Outfit | null>(null);
  const [picker, setPicker] = useState<Slot | null>(null);
  const [saving, setSaving] = useState(false);
  const [showScore, setShowScore] = useState(false);
  const [now] = useState(() => new Date());
  const started = useRef(false);

  const season = seasonForMonth(now.getMonth());
  const when = useMemo(() => ({ hour: now.getHours(), weekend: now.getDay() === 0 || now.getDay() === 6 }), [now]);
  const history = useMemo(() => (outfits || []).map((o) => ({ ids: o.items.map((i) => i.item_id), worn: o.worn_count })), [outfits]);

  // Per compartment: the pieces that match the active filter. A compartment without any
  // match keeps all its pieces, so a filter never leaves the outfit without shoes or trousers.
  const pools = useMemo(() => {
    const out = {} as Record<Slot, Item[]>;
    for (const s of SLOTS) {
      const all = items ? candidatesFor(items, s) : [];
      const hit = all.filter((i) => matchesFilter(i, filter));
      out[s] = hit.length ? hit : all;
    }
    return out;
  }, [items, filter]);
  const pooled = useMemo(() => SLOTS.flatMap((s) => pools[s]), [pools]);

  const options = useCallback(
    (m: Mode): GenOptions => ({
      mode: m,
      style: m === "style" ? style : null,
      occasion: m === "occasion" ? occasion : null,
      // "random" ignores live weather on purpose; every other mode respects it when available
      weather: m === "random" ? null : weather,
      when: m === "random" ? null : when,
      season,
      history,
      favoriteStyles: me?.prefs.favorite_styles,
    }),
    [style, occasion, weather, when, season, history, me?.prefs.favorite_styles],
  );

  const lockedSelection = useCallback(
    () => Object.fromEntries(SLOTS.filter((s) => locked[s] && sel[s]).map((s) => [s, sel[s]])) as Selection,
    [locked, sel],
  );

  const generate = useCallback(
    (m: Mode = mode) => {
      if (!items?.length) return;
      const keep = lockedSelection();
      // locked pieces always stay available, even when the filter would hide them
      const source = [...pooled, ...items.filter((i) => Object.values(keep).includes(i.id) && !pooled.includes(i))];
      const g = generateOutfit(source, { ...options(m), locked: keep, current: sel });
      if (g) setSel(g.selection);
    },
    [items, pooled, mode, sel, options, lockedSelection],
  );

  // first render with data: open a saved outfit, build around a piece, continue a draft, or generate
  useEffect(() => {
    if (started.current || !items || !outfits || !items.length) return;
    // wait for the weather so the first suggestion can already use it
    if (weatherStatus === "loading") return;
    started.current = true;
    const outfitId = params.get("outfit");
    const aroundId = params.get("around");
    const saved = outfitId ? outfits.find((o) => o.id === outfitId) : null;
    const around = aroundId ? items.find((i) => i.id === aroundId) : null;
    const byId = new Map(items.map((i) => [i.id, i]));
    const fromIds = (ids: string[]) => Object.fromEntries(ids.map((id) => byId.get(id)).filter(Boolean).map((i) => [i!.slot, i!.id])) as Selection;
    /* eslint-disable react-hooks/set-state-in-effect -- one-time initialisation from URL / storage */
    if (saved) {
      setEditing(saved);
      setSel(fromIds(saved.items.map((e) => e.item_id)));
      return;
    }
    if (around) {
      setLocked({ [around.slot]: true });
      setActive(around.slot);
      const g = generateOutfit(items, { ...options("around"), locked: { [around.slot]: around.id } });
      if (g) setSel(g.selection);
      return;
    }
    try {
      const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null") as Selection | null;
      sessionStorage.removeItem(DRAFT_KEY);
      const restored = draft ? fromIds(Object.values(draft) as string[]) : {};
      if (Object.keys(restored).length) {
        setSel(restored);
        return;
      }
    } catch {}
    const g = generateOutfit(items, options("auto"));
    if (g) setSel(g.selection);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [items, outfits, params, weatherStatus, options]);

  /** Arrow navigation inside one compartment (respects the filter). */
  const cycle = useCallback(
    (slot: Slot, dir: 1 | -1) => {
      const list = pools[slot];
      if (!list.length) return;
      setSel((s) => {
        const idx = list.findIndex((i) => i.id === s[slot]);
        const next = idx === -1 ? (dir === 1 ? 0 : list.length - 1) : (idx + dir + list.length) % list.length;
        const out: Selection = { ...s, [slot]: list[next].id };
        // a dress replaces shirt + trousers and the other way round
        if (slot === "dress") {
          delete out.top;
          delete out.bottom;
        } else if (slot === "top" || slot === "bottom") delete out.dress;
        return out;
      });
      setActive(slot);
    },
    [pools],
  );

  const remove = (slot: Slot) => {
    setSel((s) => {
      const next = { ...s };
      delete next[slot];
      return next;
    });
    setLocked((l) => ({ ...l, [slot]: false }));
  };

  const chosen = useMemo(() => resolveItems(sel, items || []), [sel, items]);
  const chosenList = useMemo(() => SLOTS.map((s) => chosen[s]).filter(Boolean) as Item[], [chosen]);
  // compartments shown: everything the wardrobe has pieces for; dress and shirt/trousers exclude each other
  const dressMode = !!sel.dress;
  const rows = useMemo(
    () =>
      SLOTS.filter((s) => {
        if (!pools[s].length) return false;
        if (s === "dress") return dressMode || !(pools.top.length || pools.bottom.length);
        if (s === "top" || s === "bottom") return !dressMode;
        return true;
      }),
    [pools, dressMode],
  );

  // arrow keys: left/right swap the piece of the selected compartment, up/down move between compartments
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (picker || saving || filterOpen || el.closest("input, textarea, select, [role=dialog]") || !rows.length) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const slot = active && rows.includes(active) ? active : rows[0];
        if (locked[slot]) return;
        e.preventDefault();
        cycle(slot, e.key === "ArrowRight" ? 1 : -1);
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const i = active ? rows.indexOf(active) : -1;
        setActive(rows[(i + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, rows, locked, picker, saving, filterOpen, cycle]);

  const scored = useMemo(() => (chosenList.length ? scoreOutfit(chosenList, options(mode)) : null), [chosenList, options, mode]);
  const explanation = useMemo(() => (chosenList.length ? explainOutfit(chosenList, options(mode)) : ""), [chosenList, options, mode]);
  const usedTags = useMemo(() => [...new Set((items || []).flatMap((i) => i.tags))].sort((a, b) => a.localeCompare(b, "de")), [items]);
  const usedColors = useMemo(() => COLORS.filter((c) => items?.some((i) => i.colors.includes(c.id))), [items]);

  if (!items || !outfits) return <Skeleton className="mx-auto h-96 max-w-md" />;

  if (items.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Outfit Builder" title="Create" />
        <EmptyState
          icon={<Shirt className="size-6" strokeWidth={1.4} />}
          title="Erst der Kleiderschrank"
          text="Sobald du Kleidungsstücke hochgeladen hast, stellst du hier Outfits daraus zusammen."
          action={
            <Link href="/wardrobe">
              <Button>Zum Kleiderschrank</Button>
            </Link>
          }
        />
      </>
    );
  }

  const canSwitchBase = pools.dress.length > 0 && pools.top.length + pools.bottom.length > 0;
  function switchBase(toDress: boolean) {
    setLocked((l) => ({ ...l, top: false, bottom: false, dress: false }));
    const keep: Selection = { ...sel };
    delete keep.top;
    delete keep.bottom;
    delete keep.dress;
    // let the generator choose the new base piece(s) that go best with everything that stays
    const source = pooled.filter((i) => (toDress ? i.slot !== "top" && i.slot !== "bottom" : i.slot !== "dress"));
    const g = generateOutfit(source, { ...options(mode), locked: keep })?.selection || {};
    if (toDress) setSel({ ...keep, ...(g.dress ? { dress: g.dress } : {}) });
    else setSel({ ...keep, ...(g.top ? { top: g.top } : {}), ...(g.bottom ? { bottom: g.bottom } : {}) });
  }

  const filterCount = (filter.style ? 1 : 0) + filter.colors.length + filter.tags.length;
  const anyLocked = SLOTS.some((s) => locked[s] && sel[s]);
  const autoHint = [
    weather ? `${weather.temp} °C, ${weather.label}${weather.place ? ` in ${weather.place}` : ""}` : "Kein Live-Wetter – es zählt die Jahreszeit",
    `${WEEKDAYS[now.getDay()]}${DAYPART_LABEL[daypart(now.getHours())]}`,
  ].join(" · ");
  const hint =
    mode === "auto"
      ? `Abgestimmt auf Wetter, Ort und Tageszeit: ${autoHint}.`
      : mode === "style"
        ? "Wähle eine Stilrichtung."
        : mode === "occasion"
          ? "Wähle einen Anlass."
          : mode === "random"
            ? "Frei kombiniert – Farben und Stil passen trotzdem zusammen."
            : "Mutigere, neue Kombinationen.";

  return (
    <>
      <PageHeader
        eyebrow={editing ? `Bearbeiten · ${editing.name}` : "Outfit Builder"}
        title="Create"
        action={
          <Button variant="outline" size="sm" onClick={() => setFilterOpen(true)} aria-label={`Filter${filterCount ? `, ${filterCount} aktiv` : ""}`}>
            <SlidersHorizontal className="size-4" aria-hidden /> Filter
            {filterCount > 0 && <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-ink">{filterCount}</span>}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] md:gap-12">
        {/* ---- the compartments, head to toe ---- */}
        <div>
          {filterCount > 0 && (
            <ChipRow label="Aktive Filter" className="mb-3">
              {filter.style && (
                <Chip active onClick={() => setFilter({ ...filter, style: null })}>
                  {filter.style} <X className="size-3" aria-hidden />
                </Chip>
              )}
              {filter.colors.map((c) => (
                <Chip key={c} active onClick={() => setFilter({ ...filter, colors: filter.colors.filter((x) => x !== c) })}>
                  <ColorDot id={c} /> {c} <X className="size-3" aria-hidden />
                </Chip>
              ))}
              {filter.tags.map((t) => (
                <Chip key={t} active onClick={() => setFilter({ ...filter, tags: filter.tags.filter((x) => x !== t) })}>
                  #{t} <X className="size-3" aria-hidden />
                </Chip>
              ))}
            </ChipRow>
          )}

          <ul className="space-y-2" aria-label="Abteile">
            {rows.map((slot) => (
              <CompartmentRow
                key={slot}
                slot={slot}
                item={chosen[slot]}
                count={pools[slot].length}
                position={chosen[slot] ? pools[slot].findIndex((i) => i.id === chosen[slot]!.id) : -1}
                active={active === slot}
                locked={!!locked[slot]}
                onCycle={(dir) => cycle(slot, dir)}
                onPick={() => {
                  setActive(slot);
                  setPicker(slot);
                }}
                onLock={() => setLocked((l) => ({ ...l, [slot]: !l[slot] }))}
                onRemove={() => remove(slot)}
              />
            ))}
          </ul>
          {canSwitchBase && (
            <div className="mt-3 flex gap-2" role="group" aria-label="Outfit-Typ">
              <Chip active={!dressMode} onClick={() => dressMode && switchBase(false)}>
                Shirt + Hose
              </Chip>
              <Chip active={dressMode} onClick={() => !dressMode && switchBase(true)}>
                Kleid / Set
              </Chip>
            </div>
          )}
        </div>

        {/* ---- generator, result image, actions ---- */}
        <div className="min-w-0 space-y-7">
          <div>
            <p className="eyebrow mb-2.5">Generator</p>
            <ChipRow label="Modus">
              {MODES.map((m) => (
                <Chip key={m.id} active={mode === m.id} onClick={() => setMode(m.id)}>
                  {m.label}
                </Chip>
              ))}
            </ChipRow>
            <p className="mt-3 text-sm text-muted">
              {hint}
              {anyLocked && " Gesperrte Teile bleiben erhalten."}
            </p>
            {mode === "style" && (
              <ChipRow label="Stil" className="mt-3">
                {STYLES.map((s) => (
                  <Chip key={s} active={style === s} onClick={() => setStyle(style === s ? null : s)}>
                    {s}
                  </Chip>
                ))}
              </ChipRow>
            )}
            {mode === "occasion" && (
              <ChipRow label="Anlass" className="mt-3">
                {OCCASIONS.map((o) => (
                  <Chip key={o.id} active={occasion === o.id} onClick={() => setOccasion(occasion === o.id ? null : o.id)}>
                    {o.id}
                  </Chip>
                ))}
              </ChipRow>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={() => generate(mode)} className="flex-1 px-4 sm:flex-none sm:px-6">
                <Shuffle className="size-4" aria-hidden /> Neu generieren
              </Button>
              {mode !== "surprise" && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setMode("surprise");
                    generate("surprise");
                  }}
                  className="flex-1 px-4 sm:flex-none sm:px-6"
                >
                  <Sparkles className="size-4" aria-hidden /> Surprise me
                </Button>
              )}
            </div>
          </div>

          <div>
            <p className="eyebrow mb-2.5">Dein Outfit</p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-center">
              <Collage items={chosen} eager className="mx-auto max-w-[17rem] sm:max-w-none" />
              <div>
                <p className="font-display text-2xl leading-snug">{explanation}</p>
                {scored && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setShowScore(!showScore)}
                      aria-expanded={showScore}
                      className="inline-flex items-center gap-1.5 text-xs text-muted transition hover:text-ink"
                    >
                      <span className="eyebrow">Match {Math.round(scored.total * 100)} %</span>
                      <ChevronDown className={cx("size-3.5 transition", showScore && "rotate-180")} aria-hidden />
                    </button>
                    {showScore && (
                      <ul className="mt-3 space-y-2.5 rounded-2xl border border-line bg-surface p-4">
                        {scored.parts.map((p) => (
                          <li key={p.key} className="flex items-center gap-3 text-xs">
                            <span className="w-32 shrink-0 truncate text-muted">{p.label}</span>
                            <span className="h-1 flex-1 overflow-hidden rounded-full bg-chip">
                              <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(p.value * 100)}%` }} />
                            </span>
                            <span className="w-8 text-right tabular-nums">{Math.round(p.value * 100)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <Button className="mt-5 w-full sm:w-auto" onClick={() => setSaving(true)} disabled={!chosenList.length}>
                  <Bookmark className="size-4" aria-hidden /> {editing ? "Änderungen speichern" : "Save Outfit"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---- pick a piece by hand ---- */}
      <Sheet open={!!picker} onClose={() => setPicker(null)} title={picker ? `${SLOT_LABEL[picker]} wählen` : ""} wide>
        {picker && (
          <ul className="grid grid-cols-3 gap-3 pt-2 sm:grid-cols-4">
            {pools[picker].map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={sel[picker] === item.id}
                  onClick={() => {
                    setSel((s) => {
                      const next = { ...s, [picker]: item.id };
                      if (picker === "dress") {
                        delete next.top;
                        delete next.bottom;
                      } else if (picker === "top" || picker === "bottom") delete next.dress;
                      return next;
                    });
                    setPicker(null);
                  }}
                  className="block w-full text-left"
                >
                  <div className={cx("aspect-[3/4] overflow-hidden rounded-xl bg-tile p-2 transition", sel[picker] === item.id ? "ring-[1.5px] ring-ink" : "hover:shadow-md")}>
                    <ItemImage item={item} className="size-full" />
                  </div>
                  <p className="mt-1.5 truncate text-xs">{item.name}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      {/* ---- filter which pieces the arrows and the generator may use ---- */}
      <Sheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter"
        footer={
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setFilter(NO_FILTER)} disabled={!filterCount}>
              Zurücksetzen
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                setFilterOpen(false);
                generate(mode);
              }}
            >
              Anwenden
            </Button>
          </div>
        }
      >
        <div className="space-y-7 pt-2">
          <p className="text-sm leading-relaxed text-muted">
            Pfeile und Generator verwenden nur Teile, die passen. Abteile ohne passendes Teil zeigen weiterhin alles.
          </p>
          <Group label="Stil">
            <div className="flex flex-wrap gap-2">
              {STYLES.map((s) => (
                <Chip key={s} active={filter.style === s} onClick={() => setFilter({ ...filter, style: filter.style === s ? null : s })}>
                  {s}
                </Chip>
              ))}
            </div>
          </Group>
          {usedColors.length > 0 && (
            <Group label="Farbe">
              <div className="flex flex-wrap gap-2">
                {usedColors.map((c) => (
                  <Chip
                    key={c.id}
                    active={filter.colors.includes(c.id)}
                    onClick={() => setFilter({ ...filter, colors: filter.colors.includes(c.id) ? filter.colors.filter((x) => x !== c.id) : [...filter.colors, c.id] })}
                  >
                    <ColorDot id={c.id} /> {c.id}
                  </Chip>
                ))}
              </div>
            </Group>
          )}
          {usedTags.length > 0 && (
            <Group label="Tags">
              <div className="flex flex-wrap gap-2">
                {usedTags.map((t) => (
                  <Chip
                    key={t}
                    active={filter.tags.includes(t)}
                    onClick={() => setFilter({ ...filter, tags: filter.tags.includes(t) ? filter.tags.filter((x) => x !== t) : [...filter.tags, t] })}
                  >
                    #{t}
                  </Chip>
                ))}
              </div>
            </Group>
          )}
        </div>
      </Sheet>

      {saving && (
        <SaveOutfitSheet
          key={editing?.id || "new"}
          items={chosen}
          outfit={editing}
          defaults={{
            ...describeOutfit(chosenList),
            styles: mode === "style" && style ? [style] : filter.style ? [filter.style] : describeOutfit(chosenList).styles,
            occasion: mode === "occasion" ? occasion : null,
            note: explanation,
            weather: mode !== "random" ? weather : null,
          }}
          onClose={() => setSaving(false)}
          onSaved={() => editing && router.push("/boards")}
        />
      )}
    </>
  );
}

/** One compartment: the current piece between two arrows. Swipe left / right works too. */
function CompartmentRow({
  slot,
  item,
  count,
  position,
  active,
  locked,
  onCycle,
  onPick,
  onLock,
  onRemove,
}: {
  slot: Slot;
  item: Item | undefined;
  count: number;
  position: number;
  active: boolean;
  locked: boolean;
  onCycle: (dir: 1 | -1) => void;
  onPick: () => void;
  onLock: () => void;
  onRemove: () => void;
}) {
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const go = (d: 1 | -1) => {
    if (locked) return;
    setDir(d);
    onCycle(d);
  };
  const arrow = "flex size-11 shrink-0 items-center justify-center rounded-full text-ink transition hover:bg-chip active:scale-90 disabled:opacity-25";

  return (
    <li
      className={cx(
        "relative flex items-center gap-1 rounded-2xl bg-tile px-1 transition",
        active ? "ring-[1.5px] ring-ink/60 ring-inset" : "ring-1 ring-transparent ring-inset",
      )}
    >
      <span className={cx("eyebrow pointer-events-none absolute top-2 left-3 z-10 text-[9.5px]", !item && "hidden")}>
        {SLOT_LABEL[slot]}
        {item && count > 1 && (
          <span className="ml-1.5 tabular-nums opacity-70">
            {position + 1}/{count}
          </span>
        )}
      </span>

      <button type="button" className={arrow} onClick={() => go(-1)} disabled={locked || (!!item && count < 2)} aria-label={`Vorheriges Teil: ${SLOT_LABEL[slot]}`}>
        <ChevronLeft className="size-5" strokeWidth={1.6} />
      </button>

      <div
        className={cx("relative min-w-0 flex-1 overflow-hidden", item ? ROW_HEIGHT[slot] : "h-14")}
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const start = touch.current;
          touch.current = null;
          if (!start) return;
          const dx = e.changedTouches[0].clientX - start.x;
          const dy = e.changedTouches[0].clientY - start.y;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
        }}
      >
        {item ? (
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.button
              key={item.id}
              type="button"
              onClick={onPick}
              aria-label={`${SLOT_LABEL[slot]}: ${item.name}. Antippen, um ein anderes Teil zu wählen`}
              custom={dir}
              variants={{
                enter: (d: number) => ({ opacity: 0, x: d * 36 }),
                show: { opacity: 1, x: 0 },
                exit: (d: number) => ({ opacity: 0, x: d * -36 }),
              }}
              initial="enter"
              animate="show"
              exit="exit"
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute inset-0 flex items-center justify-center px-2 pt-5 pb-2"
            >
              <ItemImage item={item} eager className="size-full" />
            </motion.button>
          </AnimatePresence>
        ) : (
          <button
            type="button"
            onClick={() => go(1)}
            className="flex size-full items-center justify-center gap-1.5 text-xs text-muted transition hover:text-ink"
          >
            <Plus className="size-3.5" aria-hidden /> {SLOT_LABEL[slot]} hinzufügen
          </button>
        )}
      </div>

      <button type="button" className={arrow} onClick={() => go(1)} disabled={locked || (!!item && count < 2)} aria-label={`Nächstes Teil: ${SLOT_LABEL[slot]}`}>
        <ChevronRight className="size-5" strokeWidth={1.6} />
      </button>

      {item && (
        <div className="absolute top-1 right-1 z-10 flex">
          <button
            type="button"
            onClick={onLock}
            aria-pressed={locked}
            aria-label={locked ? `${SLOT_LABEL[slot]}: Sperre aufheben` : `${SLOT_LABEL[slot]} sperren – bleibt beim Generieren erhalten`}
            className={cx("flex size-8 items-center justify-center rounded-full transition active:scale-90", locked ? "bg-primary text-primary-ink" : "text-ink/45 hover:text-ink")}
          >
            {locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`${SLOT_LABEL[slot]} aus dem Outfit entfernen`}
            className="flex size-8 items-center justify-center rounded-full text-ink/45 transition hover:text-ink active:scale-90"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </li>
  );
}
