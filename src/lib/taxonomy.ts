// Shared vocabulary of the app: categories, styles, colours, seasons, occasions.
// Pure data + helpers, used on client and server (and in node tests).

export type Group = 'tops' | 'bottoms' | 'outerwear' | 'shoes' | 'dresses' | 'accessories' | 'other';
export type Slot = 'head' | 'outerwear' | 'layer' | 'top' | 'dress' | 'bottom' | 'shoes' | 'accessory' | 'bag';

/** The compartments of an outfit, from head to toe. */
export const SLOTS: Slot[] = ['head', 'outerwear', 'layer', 'top', 'dress', 'bottom', 'shoes', 'accessory', 'bag'];

export const SLOT_LABEL: Record<Slot, string> = {
  head: 'Kopf',
  outerwear: 'Jacke',
  layer: 'Pulli',
  top: 'Shirt',
  dress: 'Kleid / Set',
  bottom: 'Hose',
  shoes: 'Schuhe',
  accessory: 'Schmuck & Uhr',
  bag: 'Tasche',
};

export const GROUPS: { id: Group; label: string; types: string[] }[] = [
  {
    id: 'tops',
    label: 'Oberteile',
    types: ['T-Shirt', 'Longsleeve', 'Hemd', 'Bluse', 'Polo', 'Pullover', 'Hoodie', 'Cardigan', 'Tanktop', 'Top', 'Sweatshirt', 'Strick'],
  },
  {
    id: 'bottoms',
    label: 'Hosen & Unterteile',
    types: ['Jeans', 'Stoffhose', 'Chino', 'Anzughose', 'Jogginghose', 'Shorts', 'Leggings', 'Rock'],
  },
  {
    id: 'outerwear',
    label: 'Jacken & Outerwear',
    types: ['Jacke', 'Blazer', 'Mantel', 'Regenjacke', 'Lederjacke', 'Daunenjacke', 'Weste'],
  },
  {
    id: 'shoes',
    label: 'Schuhe',
    types: ['Sneaker', 'Loafer', 'Boots', 'Stiefel', 'Lederschuhe', 'Sandalen', 'Heels', 'Sportschuhe'],
  },
  { id: 'dresses', label: 'Kleider & Sets', types: ['Kleid', 'Jumpsuit', 'Anzug', 'Zweiteiler'] },
  {
    id: 'accessories',
    label: 'Accessoires',
    types: ['Uhr', 'Schmuck', 'Kette', 'Ring', 'Armband', 'Ohrringe', 'Gürtel', 'Cap', 'Mütze', 'Schal', 'Tasche', 'Handtasche', 'Rucksack', 'Sonnenbrille', 'Handschuhe', 'Krawatte'],
  },
  { id: 'other', label: 'Weitere', types: ['Sportkleidung', 'Homewear', 'Saisonal'] },
];

export const GROUP_IDS = GROUPS.map((g) => g.id);
export const GROUP_LABEL = Object.fromEntries(GROUPS.map((g) => [g.id, g.label])) as Record<Group, string>;

const BAG_TYPES = ['Tasche', 'Handtasche', 'Rucksack'];
const HEAD_TYPES = ['Cap', 'Mütze', 'Sonnenbrille'];
/** worn over a shirt: they get their own compartment between jacket and shirt */
const LAYER_TYPES = ['Pullover', 'Hoodie', 'Cardigan', 'Sweatshirt', 'Strick'];

/** Where an item sits in an outfit. `other` items carry an explicit slot chosen by the user. */
export function defaultSlot(group: Group, type: string): Slot {
  switch (group) {
    case 'tops':
      return LAYER_TYPES.includes(type) ? 'layer' : 'top';
    case 'bottoms':
      return 'bottom';
    case 'dresses':
      return 'dress';
    case 'outerwear':
      return 'outerwear';
    case 'shoes':
      return 'shoes';
    case 'accessories':
      return BAG_TYPES.includes(type) ? 'bag' : HEAD_TYPES.includes(type) ? 'head' : 'accessory';
    default:
      return 'top';
  }
}

export interface TypeMeta {
  /** 0 (very light) … 5 (very warm) */
  warmth: number;
  /** 1 (very casual) … 5 (formal) */
  formality: number;
  /** 1 = good in rain, -1 = bad in rain */
  rain?: number;
  /** only makes sense in cold weather */
  winter?: boolean;
  /** only makes sense in sun / warmth */
  summer?: boolean;
  sport?: boolean;
}

export const TYPE_META: Record<string, TypeMeta> = {
  'T-Shirt': { warmth: 1, formality: 2 },
  Longsleeve: { warmth: 2, formality: 2 },
  Hemd: { warmth: 2, formality: 4 },
  Bluse: { warmth: 1, formality: 4 },
  Polo: { warmth: 1, formality: 3 },
  Pullover: { warmth: 4, formality: 3 },
  Hoodie: { warmth: 4, formality: 1 },
  Cardigan: { warmth: 3, formality: 3 },
  Tanktop: { warmth: 0, formality: 1, summer: true },
  Top: { warmth: 0, formality: 2, summer: true },
  Sweatshirt: { warmth: 3, formality: 1 },
  Strick: { warmth: 4, formality: 3 },
  Jeans: { warmth: 3, formality: 2 },
  Stoffhose: { warmth: 2, formality: 4 },
  Chino: { warmth: 2, formality: 3 },
  Anzughose: { warmth: 2, formality: 5 },
  Jogginghose: { warmth: 3, formality: 1, sport: true },
  Shorts: { warmth: 0, formality: 1, summer: true },
  Leggings: { warmth: 2, formality: 1, sport: true },
  Rock: { warmth: 1, formality: 3 },
  Jacke: { warmth: 3, formality: 2 },
  Blazer: { warmth: 2, formality: 4 },
  Mantel: { warmth: 5, formality: 4, winter: true },
  Regenjacke: { warmth: 2, formality: 1, rain: 1 },
  Lederjacke: { warmth: 3, formality: 2 },
  Daunenjacke: { warmth: 5, formality: 1, winter: true, rain: 1 },
  Weste: { warmth: 2, formality: 3 },
  Sneaker: { warmth: 2, formality: 2 },
  Loafer: { warmth: 2, formality: 4 },
  Boots: { warmth: 4, formality: 2, rain: 1 },
  Stiefel: { warmth: 4, formality: 3, rain: 1 },
  Lederschuhe: { warmth: 2, formality: 5 },
  Sandalen: { warmth: 0, formality: 1, rain: -1, summer: true },
  Heels: { warmth: 1, formality: 5, rain: -1 },
  Sportschuhe: { warmth: 2, formality: 1, sport: true },
  Kleid: { warmth: 1, formality: 4 },
  Jumpsuit: { warmth: 2, formality: 3 },
  Anzug: { warmth: 3, formality: 5 },
  Zweiteiler: { warmth: 2, formality: 4 },
  Uhr: { warmth: 0, formality: 3 },
  Schmuck: { warmth: 0, formality: 3 },
  Kette: { warmth: 0, formality: 3 },
  Ring: { warmth: 0, formality: 3 },
  Armband: { warmth: 0, formality: 3 },
  Ohrringe: { warmth: 0, formality: 3 },
  Gürtel: { warmth: 0, formality: 3 },
  Cap: { warmth: 0, formality: 1 },
  Mütze: { warmth: 2, formality: 1, winter: true },
  Schal: { warmth: 2, formality: 3, winter: true },
  Tasche: { warmth: 0, formality: 3 },
  Handtasche: { warmth: 0, formality: 4 },
  Rucksack: { warmth: 0, formality: 1 },
  Sonnenbrille: { warmth: 0, formality: 3, summer: true },
  Handschuhe: { warmth: 2, formality: 3, winter: true },
  Krawatte: { warmth: 0, formality: 5 },
  Sportkleidung: { warmth: 1, formality: 1, sport: true },
  Homewear: { warmth: 2, formality: 1 },
  Saisonal: { warmth: 2, formality: 2 },
};

export const DEFAULT_META: TypeMeta = { warmth: 2, formality: 3 };

export const STYLES = [
  'Old Money',
  'Streetwear',
  'Classic',
  'Minimalist',
  'Smart Casual',
  'Business',
  'Elegant',
  'Chic',
  'Sporty',
  'Casual',
  'Scandinavian',
  'Vintage',
  'Preppy',
  'Quiet Luxury',
  'Date Night',
] as const;

/** Styles that sit close together and may be mixed in one outfit. */
export const STYLE_AFFINITY: Record<string, string[]> = {
  'Old Money': ['Classic', 'Preppy', 'Quiet Luxury', 'Elegant', 'Smart Casual'],
  Streetwear: ['Casual', 'Sporty', 'Vintage'],
  Classic: ['Old Money', 'Business', 'Smart Casual', 'Elegant', 'Minimalist', 'Quiet Luxury'],
  Minimalist: ['Scandinavian', 'Quiet Luxury', 'Classic', 'Casual'],
  'Smart Casual': ['Classic', 'Casual', 'Business', 'Old Money', 'Preppy'],
  Business: ['Classic', 'Elegant', 'Smart Casual'],
  Elegant: ['Chic', 'Classic', 'Date Night', 'Business', 'Quiet Luxury', 'Old Money'],
  Chic: ['Elegant', 'Date Night', 'Minimalist'],
  Sporty: ['Casual', 'Streetwear'],
  Casual: ['Smart Casual', 'Streetwear', 'Sporty', 'Minimalist', 'Scandinavian', 'Vintage'],
  Scandinavian: ['Minimalist', 'Casual', 'Quiet Luxury'],
  Vintage: ['Streetwear', 'Casual', 'Preppy'],
  Preppy: ['Old Money', 'Classic', 'Smart Casual', 'Vintage'],
  'Quiet Luxury': ['Old Money', 'Minimalist', 'Elegant', 'Classic', 'Scandinavian'],
  'Date Night': ['Elegant', 'Chic', 'Smart Casual'],
};

export const SEASONS = ['Frühling', 'Sommer', 'Herbst', 'Winter'] as const;
export type Season = (typeof SEASONS)[number];

export function seasonForMonth(month: number): Season {
  if (month >= 2 && month <= 4) return 'Frühling';
  if (month >= 5 && month <= 7) return 'Sommer';
  if (month >= 8 && month <= 10) return 'Herbst';
  return 'Winter';
}

export interface OccasionMeta {
  id: string;
  styles: string[];
  /** preferred formality range */
  formality: [number, number];
  sport?: boolean;
}

export const OCCASIONS: OccasionMeta[] = [
  { id: 'Arbeit', styles: ['Business', 'Smart Casual', 'Classic'], formality: [3, 5] },
  { id: 'Freizeit', styles: ['Casual', 'Streetwear', 'Minimalist', 'Scandinavian'], formality: [1, 3] },
  { id: 'Date', styles: ['Date Night', 'Chic', 'Elegant', 'Smart Casual'], formality: [3, 5] },
  { id: 'Dinner', styles: ['Elegant', 'Smart Casual', 'Quiet Luxury', 'Old Money'], formality: [3, 5] },
  { id: 'Event', styles: ['Elegant', 'Chic', 'Classic'], formality: [4, 5] },
  { id: 'Sport', styles: ['Sporty'], formality: [1, 2], sport: true },
  { id: 'Reise', styles: ['Casual', 'Minimalist', 'Smart Casual'], formality: [1, 3] },
];

export const PATTERNS = ['Uni', 'Gestreift', 'Kariert', 'Gepunktet', 'Floral', 'Print', 'Strukturiert', 'Animal'];
export const MATERIALS = ['Baumwolle', 'Wolle', 'Kaschmir', 'Leinen', 'Seide', 'Denim', 'Leder', 'Wildleder', 'Synthetik', 'Viskose', 'Cord', 'Fleece', 'Metall'];

/** Material nudges the warmth of an item up or down. */
export const MATERIAL_WARMTH: Record<string, number> = {
  Wolle: 1,
  Kaschmir: 1,
  Fleece: 1,
  Cord: 0.5,
  Leinen: -1,
  Seide: -0.5,
  Viskose: -0.5,
};

export interface ColorDef {
  id: string;
  hex: string;
  neutral: boolean;
  earth?: boolean;
}

export const COLORS: ColorDef[] = [
  { id: 'Schwarz', hex: '#1b1b1b', neutral: true },
  { id: 'Anthrazit', hex: '#3d3f42', neutral: true },
  { id: 'Grau', hex: '#9a9a98', neutral: true },
  { id: 'Weiss', hex: '#fbfaf7', neutral: true },
  { id: 'Creme', hex: '#f1e9d9', neutral: true },
  { id: 'Beige', hex: '#d8c4a5', neutral: true, earth: true },
  { id: 'Taupe', hex: '#9c8b7b', neutral: true, earth: true },
  { id: 'Camel', hex: '#b98a56', neutral: false, earth: true },
  { id: 'Braun', hex: '#6b4a34', neutral: false, earth: true },
  { id: 'Oliv', hex: '#6b6f47', neutral: false, earth: true },
  { id: 'Grün', hex: '#3f7a4f', neutral: false },
  { id: 'Navy', hex: '#1f2a44', neutral: true },
  { id: 'Blau', hex: '#3566b0', neutral: false },
  { id: 'Hellblau', hex: '#a9c6e4', neutral: false },
  { id: 'Rot', hex: '#b5302c', neutral: false },
  { id: 'Bordeaux', hex: '#6a1f2b', neutral: false },
  { id: 'Rosa', hex: '#e7b9c0', neutral: false },
  { id: 'Mauve', hex: '#a98794', neutral: false },
  { id: 'Lila', hex: '#7a5aa0', neutral: false },
  { id: 'Gelb', hex: '#e6c64a', neutral: false },
  { id: 'Orange', hex: '#d9772e', neutral: false },
  { id: 'Silber', hex: '#c9ccd0', neutral: true },
  { id: 'Gold', hex: '#c9a758', neutral: true },
  { id: 'Mehrfarbig', hex: '#888888', neutral: false },
];

export const COLOR_BY_ID = Object.fromEntries(COLORS.map((c) => [c.id, c])) as Record<string, ColorDef>;

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

/** Nearest palette colour for an RGB value (used for the on-device colour suggestion). */
export function nearestColor(r: number, g: number, b: number): string {
  let best = 'Grau';
  let bestD = Infinity;
  for (const c of COLORS) {
    if (c.id === 'Mehrfarbig' || c.id === 'Silber' || c.id === 'Gold') continue;
    const [cr, cg, cb] = hexToRgb(c.hex);
    // "redmean" weighted distance — cheap and perceptually reasonable
    const rm = (r + cr) / 2;
    const d = (2 + rm / 256) * (r - cr) ** 2 + 4 * (g - cg) ** 2 + (2 + (255 - rm) / 256) * (b - cb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c.id;
    }
  }
  return best;
}

/** 0…1 — how well two palette colours sit together. */
export function colorPairScore(a: string, b: string): number {
  const ca = COLOR_BY_ID[a];
  const cb = COLOR_BY_ID[b];
  if (!ca || !cb) return 0.6;
  if (a === 'Mehrfarbig' || b === 'Mehrfarbig') return ca.neutral || cb.neutral ? 0.75 : 0.4;
  if (ca.earth && cb.earth) return 0.95;
  if (ca.neutral && cb.neutral) {
    const la = rgbToHsl(...hexToRgb(ca.hex))[2];
    const lb = rgbToHsl(...hexToRgb(cb.hex))[2];
    return 0.8 + Math.min(0.15, Math.abs(la - lb) * 0.3);
  }
  if (ca.neutral || cb.neutral) return 0.88;
  if (a === b) return 0.72;
  const ha = rgbToHsl(...hexToRgb(ca.hex))[0];
  const hb = rgbToHsl(...hexToRgb(cb.hex))[0];
  let diff = Math.abs(ha - hb);
  if (diff > 180) diff = 360 - diff;
  if (diff < 40) return 0.75;
  if (diff > 150) return 0.55;
  return 0.3;
}
