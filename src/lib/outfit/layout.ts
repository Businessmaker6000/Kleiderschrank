// Flat-lay composition for the outfit collage. Every slot gets its own, non-overlapping
// box (percent of a 4:5 canvas), chosen from a template that fits the outfit type.
import type { Slot } from '../taxonomy.ts';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Template = Partial<Record<Slot, Box>>;

const b = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });

const TEMPLATES: Record<string, Template> = {
  // jacket left, top right, trousers below, shoes bottom-left, small pieces on the right edge
  layered: {
    outerwear: b(2, 2, 46, 50),
    top: b(51, 3, 46, 41),
    bottom: b(49, 46, 29, 52),
    shoes: b(5, 56, 36, 38),
    accessory: b(79, 47, 19, 22),
    bag: b(79, 71, 19, 26),
  },
  layeredPlain: {
    outerwear: b(2, 2, 46, 50),
    top: b(51, 3, 46, 41),
    bottom: b(48, 46, 44, 52),
    shoes: b(5, 56, 38, 38),
  },
  simple: {
    top: b(5, 2, 57, 46),
    bottom: b(9, 50, 50, 48),
    shoes: b(63, 62, 33, 34),
    accessory: b(66, 4, 30, 26),
    bag: b(66, 32, 30, 28),
  },
  simplePlain: {
    top: b(22, 2, 56, 46),
    bottom: b(8, 50, 48, 48),
    shoes: b(60, 58, 34, 36),
  },
  dressLayered: {
    outerwear: b(2, 2, 42, 50),
    dress: b(45, 2, 34, 84),
    shoes: b(4, 56, 36, 38),
    accessory: b(80, 4, 18, 22),
    bag: b(80, 30, 18, 28),
  },
  dress: {
    dress: b(6, 2, 54, 96),
    shoes: b(64, 62, 32, 34),
    accessory: b(64, 4, 32, 26),
    bag: b(64, 32, 32, 28),
  },
};

/** Picks the template for the given set of slots and returns a box for each of them. */
export function collageLayout(slots: Slot[]): Partial<Record<Slot, Box>> {
  const has = (s: Slot) => slots.includes(s);
  const small = has('accessory') || has('bag');
  const dress = has('dress') && !has('top') && !has('bottom');
  let name: string;
  if (dress) name = has('outerwear') ? 'dressLayered' : 'dress';
  else if (has('outerwear')) name = small ? 'layered' : 'layeredPlain';
  else name = small ? 'simple' : 'simplePlain';
  const template = TEMPLATES[name];
  const out: Partial<Record<Slot, Box>> = {};
  for (const s of slots) if (template[s]) out[s] = template[s];
  return out;
}

export function boxesOverlap(a: Box, c: Box): boolean {
  return a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h;
}

export const ALL_TEMPLATES = TEMPLATES;
