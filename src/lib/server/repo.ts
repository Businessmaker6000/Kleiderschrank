// Domain data access. Every function takes the profile id of the unlocked profile and
// filters by it — this is the single place that guarantees Kole's and Alisha's data never mix.
import { randomUUID } from 'node:crypto';
import { db } from './db.ts';
import type { Row } from './db.ts';
import { ApiError } from './errors.ts';
import { COLOR_BY_ID, GROUP_IDS, MATERIALS, OCCASIONS, PATTERNS, SEASONS, SLOTS, STYLES, defaultSlot } from '../taxonomy.ts';
import type { Group, Slot } from '../taxonomy.ts';
import type { Board, CustomCategory, Item, Outfit, OutfitEntry, Prefs, WeatherSnapshot } from '../types.ts';

// ---------- input sanitising ----------

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
function optStr(v: unknown, max: number): string | null {
  return str(v, max) || null;
}
function list(v: unknown, allowed: readonly string[] | null, maxItems: number, maxLen = 30): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    const s = str(x, maxLen);
    if (s && (!allowed || allowed.includes(s)) && !out.includes(s)) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}
function num(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
}

const COLOR_IDS = Object.keys(COLOR_BY_ID);
const OCCASION_IDS = OCCASIONS.map((o) => o.id);

// ---------- items ----------

interface ItemRow {
  id: string;
  profile_id: string;
  name: string;
  item_group: Group;
  type: string;
  slot: Slot;
  colors: string[];
  pattern: string | null;
  material: string | null;
  seasons: string[];
  styles: string[];
  tags: string[];
  favorite: boolean;
  wear_count: number;
  created_at: string;
}

interface ImageRow {
  id: string;
  item_id: string;
  profile_id: string;
  path: string;
  width: number;
  height: number;
  content_type: string;
}

function itemFields(input: Row, partial: boolean): Partial<ItemRow> {
  const out: Partial<ItemRow> = {};
  const has = (k: string) => !partial || k in input;
  if (has('group') || has('type') || has('slot')) {
    const group = GROUP_IDS.includes(input.group as Group) ? (input.group as Group) : null;
    const type = str(input.type, 40);
    if (!group || !type) {
      if (!partial || 'group' in input || 'type' in input) throw new ApiError(400, 'Bitte Kategorie und Art wählen.');
    } else {
      out.item_group = group;
      out.type = type;
      out.slot = group === 'other' ? (SLOTS.includes(input.slot as Slot) ? (input.slot as Slot) : 'top') : defaultSlot(group, type);
    }
  }
  if (has('name')) out.name = str(input.name, 60) || out.type || 'Kleidungsstück';
  if (has('colors')) out.colors = list(input.colors, COLOR_IDS, 4);
  if (has('pattern')) out.pattern = PATTERNS.includes(str(input.pattern, 30)) ? str(input.pattern, 30) : null;
  if (has('material')) out.material = MATERIALS.includes(str(input.material, 30)) ? str(input.material, 30) : null;
  if (has('seasons')) out.seasons = list(input.seasons, SEASONS, 4);
  if (has('styles')) out.styles = list(input.styles, STYLES, 8);
  if (has('tags')) out.tags = list(input.tags, null, 12, 24);
  if (has('favorite')) out.favorite = input.favorite === true;
  return out;
}

function toItem(r: ItemRow, img: ImageRow | undefined): Item {
  return {
    id: r.id,
    name: r.name,
    group: r.item_group,
    type: r.type,
    slot: r.slot,
    colors: r.colors || [],
    pattern: r.pattern,
    material: r.material,
    seasons: r.seasons || [],
    styles: r.styles || [],
    tags: r.tags || [],
    favorite: !!r.favorite,
    wear_count: r.wear_count || 0,
    created_at: r.created_at,
    image: img ? { path: img.path, width: img.width, height: img.height } : null,
  };
}

export async function listItems(profileId: string): Promise<Item[]> {
  const [rows, images] = await Promise.all([
    db().select<ItemRow>('clothing_items', { profile_id: profileId }),
    db().select<ImageRow>('clothing_images', { profile_id: profileId }),
  ]);
  const byItem = new Map(images.map((i) => [i.item_id, i]));
  return rows.map((r) => toItem(r, byItem.get(r.id))).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function sniffImage(data: Buffer): { ext: string; contentType: string } | null {
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { ext: 'jpg', contentType: 'image/jpeg' };
  if (data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { ext: 'png', contentType: 'image/png' };
  if (data.length > 12 && data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP')
    return { ext: 'webp', contentType: 'image/webp' };
  return null;
}

export async function createItem(
  profileId: string,
  input: Row,
  image: { data: Buffer; width: unknown; height: unknown },
): Promise<Item> {
  if (!image.data.length) throw new ApiError(400, 'Es wurde kein Bild übermittelt.');
  if (image.data.length > MAX_IMAGE_BYTES) throw new ApiError(413, 'Das Bild ist zu gross (maximal 8 MB).');
  const kind = sniffImage(image.data);
  if (!kind) throw new ApiError(415, 'Dieses Bildformat wird nicht unterstützt (JPEG, PNG oder WebP).');
  const fields = itemFields(input, false);
  const row: ItemRow = {
    id: randomUUID(),
    profile_id: profileId,
    name: fields.name!,
    item_group: fields.item_group!,
    type: fields.type!,
    slot: fields.slot!,
    colors: fields.colors || [],
    pattern: fields.pattern ?? null,
    material: fields.material ?? null,
    seasons: fields.seasons || [],
    styles: fields.styles || [],
    tags: fields.tags || [],
    favorite: fields.favorite || false,
    wear_count: 0,
    created_at: new Date().toISOString(),
  };
  const img: ImageRow = {
    id: randomUUID(),
    item_id: row.id,
    profile_id: profileId,
    path: `${profileId}/${row.id}.${kind.ext}`,
    width: Math.round(num(image.width, 1, 10000) ?? 1000),
    height: Math.round(num(image.height, 1, 10000) ?? 1000),
    content_type: kind.contentType,
  };
  // file first: a row must never point at a missing image
  await db().putFile(img.path, image.data, kind.contentType);
  try {
    await db().insert('clothing_items', [row as unknown as Row]);
    await db().insert('clothing_images', [img as unknown as Row]);
  } catch (e) {
    await db().remove('clothing_items', { id: row.id, profile_id: profileId }).catch(() => {});
    await db().removeFiles([img.path]).catch(() => {});
    throw e;
  }
  return toItem(row, img);
}

async function ownItem(profileId: string, id: string): Promise<ItemRow> {
  const row = (await db().select<ItemRow>('clothing_items', { id, profile_id: profileId }))[0];
  if (!row) throw new ApiError(404, 'Kleidungsstück nicht gefunden.');
  return row;
}

export async function updateItem(profileId: string, id: string, input: Row): Promise<Item> {
  const row = await ownItem(profileId, id);
  const patch = itemFields(input, true);
  if (Object.keys(patch).length) await db().update('clothing_items', { id, profile_id: profileId }, patch as Row);
  if (patch.slot && patch.slot !== row.slot) {
    // the piece changed its place in an outfit — keep saved outfits consistent
    await db().update('outfit_items', { item_id: id, profile_id: profileId }, { slot: patch.slot });
  }
  const img = (await db().select<ImageRow>('clothing_images', { item_id: id, profile_id: profileId }))[0];
  return toItem({ ...row, ...patch }, img);
}

export async function deleteItem(profileId: string, id: string): Promise<void> {
  await ownItem(profileId, id);
  const images = await db().select<ImageRow>('clothing_images', { item_id: id, profile_id: profileId });
  const affected = await db().select<{ outfit_id: string }>('outfit_items', { item_id: id, profile_id: profileId });
  await db().remove('outfit_items', { item_id: id, profile_id: profileId });
  await db().remove('clothing_images', { item_id: id, profile_id: profileId });
  await db().remove('clothing_items', { id, profile_id: profileId });
  await db().removeFiles(images.map((i) => i.path));
  // outfits that lost their last piece have nothing left to show
  for (const outfitId of new Set(affected.map((a) => a.outfit_id))) {
    const rest = await db().select('outfit_items', { outfit_id: outfitId, profile_id: profileId });
    if (!rest.length) await deleteOutfit(profileId, outfitId);
  }
}

export async function readImage(profileId: string, filePath: string): Promise<{ data: Buffer; contentType: string } | null> {
  // the path itself is scoped to the profile, and it must be a known image row
  if (!filePath.startsWith(profileId + '/')) return null;
  const row = (await db().select<ImageRow>('clothing_images', { path: filePath, profile_id: profileId }))[0];
  if (!row) return null;
  const data = await db().getFile(row.path);
  return data ? { data, contentType: row.content_type } : null;
}

// ---------- outfits ----------

interface OutfitRow {
  id: string;
  profile_id: string;
  name: string;
  styles: string[];
  season: string | null;
  occasion: string | null;
  note: string | null;
  favorite: boolean;
  worn_count: number;
  weather: WeatherSnapshot | null;
  created_at: string;
  updated_at: string;
}

interface OutfitItemRow {
  outfit_id: string;
  item_id: string;
  profile_id: string;
  slot: Slot;
  position: number;
}

function weatherSnapshot(v: unknown): WeatherSnapshot | null {
  if (!v || typeof v !== 'object') return null;
  const w = v as Row;
  const temp = num(w.temp, -60, 60);
  if (temp === null) return null;
  return {
    temp,
    feels: num(w.feels, -60, 60) ?? temp,
    rainProb: num(w.rainProb, 0, 100) ?? 0,
    wind: num(w.wind, 0, 300) ?? 0,
    code: num(w.code, 0, 99) ?? 0,
    label: str(w.label, 40),
    high: num(w.high, -60, 60) ?? temp,
    low: num(w.low, -60, 60) ?? temp,
    place: optStr(w.place, 60),
  };
}

function outfitFields(input: Row, partial: boolean): Partial<OutfitRow> {
  const out: Partial<OutfitRow> = {};
  const has = (k: string) => !partial || k in input;
  if (has('name')) out.name = str(input.name, 60) || 'Outfit';
  if (has('styles')) out.styles = list(input.styles, STYLES, 6);
  if (has('season')) out.season = (SEASONS as readonly string[]).includes(str(input.season, 20)) ? str(input.season, 20) : null;
  if (has('occasion')) out.occasion = OCCASION_IDS.includes(str(input.occasion, 20)) ? str(input.occasion, 20) : null;
  if (has('note')) out.note = optStr(input.note, 240);
  if (has('favorite')) out.favorite = input.favorite === true;
  if (has('weather')) out.weather = weatherSnapshot(input.weather);
  return out;
}

/** Resolves requested pieces against the profile's own wardrobe. Foreign or unknown ids are rejected. */
async function resolveEntries(profileId: string, raw: unknown): Promise<OutfitEntry[]> {
  if (!Array.isArray(raw)) throw new ApiError(400, 'Das Outfit enthält keine Kleidungsstücke.');
  const ids = [...new Set(raw.map((e) => (e && typeof e === 'object' ? str((e as Row).item_id, 64) : '')).filter(Boolean))];
  if (!ids.length) throw new ApiError(400, 'Das Outfit enthält keine Kleidungsstücke.');
  if (ids.length > 12) throw new ApiError(400, 'Zu viele Kleidungsstücke in einem Outfit.');
  const rows = await db().select<ItemRow>('clothing_items', { profile_id: profileId, id: ids });
  if (rows.length !== ids.length) throw new ApiError(400, 'Ein Kleidungsstück gehört nicht zu diesem Kleiderschrank.');
  const bySlot = new Map<Slot, string>();
  for (const id of ids) {
    const row = rows.find((r) => r.id === id)!;
    if (!bySlot.has(row.slot)) bySlot.set(row.slot, row.id);
  }
  return SLOTS.filter((s) => bySlot.has(s)).map((slot) => ({ slot, item_id: bySlot.get(slot)! }));
}

export async function listOutfits(profileId: string): Promise<Outfit[]> {
  const [rows, entries, memberships] = await Promise.all([
    db().select<OutfitRow>('outfits', { profile_id: profileId }),
    db().select<OutfitItemRow>('outfit_items', { profile_id: profileId }),
    db().select<{ board_id: string; outfit_id: string }>('board_outfits', { profile_id: profileId }),
  ]);
  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      styles: r.styles || [],
      season: r.season,
      occasion: r.occasion,
      note: r.note,
      favorite: !!r.favorite,
      worn_count: r.worn_count || 0,
      weather: r.weather || null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      items: entries
        .filter((e) => e.outfit_id === r.id)
        .sort((a, b) => a.position - b.position)
        .map((e) => ({ slot: e.slot, item_id: e.item_id })),
      board_ids: memberships.filter((m) => m.outfit_id === r.id).map((m) => m.board_id),
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function getOutfit(profileId: string, id: string): Promise<Outfit> {
  const outfit = (await listOutfits(profileId)).find((o) => o.id === id);
  if (!outfit) throw new ApiError(404, 'Outfit nicht gefunden.');
  return outfit;
}

async function writeEntries(profileId: string, outfitId: string, entries: OutfitEntry[]) {
  await db().remove('outfit_items', { outfit_id: outfitId, profile_id: profileId });
  await db().insert(
    'outfit_items',
    entries.map((e, position) => ({ outfit_id: outfitId, item_id: e.item_id, profile_id: profileId, slot: e.slot, position })),
  );
}

export async function createOutfit(profileId: string, input: Row): Promise<Outfit> {
  const entries = await resolveEntries(profileId, input.items);
  const fields = outfitFields(input, false);
  const now = new Date().toISOString();
  const row: OutfitRow = {
    id: randomUUID(),
    profile_id: profileId,
    name: fields.name!,
    styles: fields.styles || [],
    season: fields.season ?? null,
    occasion: fields.occasion ?? null,
    note: fields.note ?? null,
    favorite: fields.favorite || false,
    worn_count: 0,
    weather: fields.weather ?? null,
    created_at: now,
    updated_at: now,
  };
  await db().insert('outfits', [row as unknown as Row]);
  await writeEntries(profileId, row.id, entries);
  const boardIds = list(input.board_ids, null, 20, 64);
  if (boardIds.length) await setOutfitBoards(profileId, row.id, boardIds);
  return getOutfit(profileId, row.id);
}

export async function updateOutfit(profileId: string, id: string, input: Row): Promise<Outfit> {
  await getOutfit(profileId, id);
  const patch = outfitFields(input, true);
  if ('items' in input) await writeEntries(profileId, id, await resolveEntries(profileId, input.items));
  await db().update('outfits', { id, profile_id: profileId }, { ...patch, updated_at: new Date().toISOString() } as Row);
  if ('board_ids' in input) await setOutfitBoards(profileId, id, list(input.board_ids, null, 20, 64));
  return getOutfit(profileId, id);
}

export async function deleteOutfit(profileId: string, id: string): Promise<void> {
  await db().remove('board_outfits', { outfit_id: id, profile_id: profileId });
  await db().remove('outfit_items', { outfit_id: id, profile_id: profileId });
  await db().remove('outfits', { id, profile_id: profileId });
}

export async function duplicateOutfit(profileId: string, id: string): Promise<Outfit> {
  const src = await getOutfit(profileId, id);
  return createOutfit(profileId, { ...src, name: `${src.name} (Kopie)`.slice(0, 60), favorite: false } as unknown as Row);
}

/** "Worn today": feeds the generator's rotation logic. */
export async function wearOutfit(profileId: string, id: string): Promise<Outfit> {
  const outfit = await getOutfit(profileId, id);
  await db().update('outfits', { id, profile_id: profileId }, { worn_count: outfit.worn_count + 1 });
  const rows = await db().select<ItemRow>('clothing_items', { profile_id: profileId, id: outfit.items.map((i) => i.item_id) });
  for (const r of rows) await db().update('clothing_items', { id: r.id, profile_id: profileId }, { wear_count: (r.wear_count || 0) + 1 });
  return { ...outfit, worn_count: outfit.worn_count + 1 };
}

// ---------- boards ----------

export async function listBoards(profileId: string): Promise<Board[]> {
  const rows = await db().select<Board & { profile_id: string }>('boards', { profile_id: profileId });
  return rows.map((b) => ({ id: b.id, name: b.name, created_at: b.created_at })).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function createBoard(profileId: string, input: Row): Promise<Board> {
  const name = str(input.name, 40);
  if (!name) throw new ApiError(400, 'Bitte einen Namen eingeben.');
  const existing = await listBoards(profileId);
  if (existing.some((b) => b.name.toLowerCase() === name.toLowerCase())) throw new ApiError(409, 'Diese Kollektion gibt es bereits.');
  if (existing.length >= 40) throw new ApiError(400, 'Maximale Anzahl Kollektionen erreicht.');
  const board = { id: randomUUID(), profile_id: profileId, name, created_at: new Date().toISOString() };
  await db().insert('boards', [board]);
  return { id: board.id, name, created_at: board.created_at };
}

export async function deleteBoard(profileId: string, id: string): Promise<void> {
  await db().remove('board_outfits', { board_id: id, profile_id: profileId });
  await db().remove('boards', { id, profile_id: profileId });
}

async function setOutfitBoards(profileId: string, outfitId: string, boardIds: string[]) {
  const own = (await listBoards(profileId)).map((b) => b.id);
  const valid = boardIds.filter((b) => own.includes(b));
  await db().remove('board_outfits', { outfit_id: outfitId, profile_id: profileId });
  await db().insert(
    'board_outfits',
    valid.map((board_id) => ({ board_id, outfit_id: outfitId, profile_id: profileId })),
  );
}

// ---------- preferences & custom categories ----------

export async function getPrefs(profileId: string): Promise<Prefs> {
  const r = (await db().select<Prefs & { profile_id: string }>('user_preferences', { profile_id: profileId }))[0];
  return {
    use_location: r ? !!r.use_location : true,
    city: r?.city ?? null,
    lat: r?.lat ?? null,
    lon: r?.lon ?? null,
    favorite_styles: r?.favorite_styles || [],
  };
}

export async function updatePrefs(profileId: string, input: Row): Promise<Prefs> {
  const patch: Row = {};
  if ('use_location' in input) patch.use_location = input.use_location === true;
  if ('city' in input) {
    patch.city = optStr(input.city, 60);
    patch.lat = patch.city ? num(input.lat, -90, 90) : null;
    patch.lon = patch.city ? num(input.lon, -180, 180) : null;
  }
  if ('favorite_styles' in input) patch.favorite_styles = list(input.favorite_styles, STYLES, 6);
  const exists = (await db().select('user_preferences', { profile_id: profileId })).length > 0;
  if (exists) await db().update('user_preferences', { profile_id: profileId }, patch);
  else await db().insert('user_preferences', [{ profile_id: profileId, use_location: true, city: null, lat: null, lon: null, favorite_styles: [], ...patch }]);
  return getPrefs(profileId);
}

export async function listCategories(profileId: string): Promise<CustomCategory[]> {
  const rows = await db().select<{ id: string; name: string; item_group: Group }>('custom_categories', { profile_id: profileId });
  return rows.map((r) => ({ id: r.id, name: r.name, group: r.item_group })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function createCategory(profileId: string, input: Row): Promise<CustomCategory> {
  const name = str(input.name, 40);
  const group = GROUP_IDS.includes(input.group as Group) ? (input.group as Group) : null;
  if (!name || !group) throw new ApiError(400, 'Bitte Namen und Bereich angeben.');
  const existing = await listCategories(profileId);
  const dup = existing.find((c) => c.group === group && c.name.toLowerCase() === name.toLowerCase());
  if (dup) return dup;
  if (existing.length >= 60) throw new ApiError(400, 'Maximale Anzahl eigener Kategorien erreicht.');
  const row = { id: randomUUID(), profile_id: profileId, name, item_group: group };
  await db().insert('custom_categories', [row]);
  return { id: row.id, name, group };
}

export async function deleteCategory(profileId: string, id: string): Promise<void> {
  await db().remove('custom_categories', { id, profile_id: profileId });
}
