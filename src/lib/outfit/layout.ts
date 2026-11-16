// Flat-lay composition for the outfit collage ("vision board" image). Every piece gets its
// own, non-overlapping box, in percent of the canvas. The arrangement adapts to which
// compartments are filled: upper-body pieces share the top row, trousers and shoes sit
// below, small pieces (head, jewellery, bag) line up in a narrow column.
import type { Slot } from '../taxonomy.ts';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const b = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });

/** Stacks boxes of equal height into a column. */
function column(slots: Slot[], x: number, y: number, w: number, h: number, gap = 2): Partial<Record<Slot, Box>> {
  const out: Partial<Record<Slot, Box>> = {};
  if (!slots.length) return out;
  const each = Math.min((h - gap * (slots.length - 1)) / slots.length, w * 1.35);
  slots.forEach((s, i) => (out[s] = b(x, y + i * (each + gap), w, each)));
  return out;
}

export function collageLayout(slots: Slot[]): Partial<Record<Slot, Box>> {
  const has = (s: Slot) => slots.includes(s);
  const small = (['head', 'accessory', 'bag'] as Slot[]).filter(has);
  const out: Partial<Record<Slot, Box>> = {};

  if (has('dress') && !has('top') && !has('bottom')) {
    // dress in the middle; jacket and shoes left; pullover and small pieces right
    out.dress = b(34, 2, 32, 90);
    if (has('outerwear')) out.outerwear = b(2, 2, 30, 46);
    if (has('shoes')) out.shoes = b(2, has('outerwear') ? 56 : 34, 30, 38);
    const right: Slot[] = [...(has('layer') ? (['layer'] as Slot[]) : []), ...small];
    Object.assign(out, column(right, 68, 2, 30, 96));
    return out;
  }

  // top row: jacket, pullover, shirt — whichever exist share the width
  const upper = (['outerwear', 'layer', 'top'] as Slot[]).filter(has);
  const sideColumn = small.length > 0;
  if (upper.length === 3) {
    out.outerwear = b(2, 2, 32, 44);
    out.layer = b(35, 2, 31, 40);
    out.top = b(67, 2, 31, 38);
  } else if (upper.length === 2) {
    out[upper[0]] = b(3, 2, 45, 44);
    out[upper[1]] = b(51, 3, 45, 41);
  } else if (upper.length === 1) {
    // one piece: it gets the stage, small pieces move up beside it
    out[upper[0]] = sideColumn ? b(4, 2, 56, 46) : b(22, 2, 56, 46);
  }

  if (upper.length === 1 && sideColumn) {
    Object.assign(out, column(small, 66, 3, 30, 44));
    if (has('bottom')) out.bottom = b(8, 50, 46, 48);
    if (has('shoes')) out.shoes = b(60, 58, 34, 38);
    return out;
  }

  // bottom row: shoes left, trousers centre, small pieces right
  if (sideColumn) {
    if (has('shoes')) out.shoes = b(3, 58, 32, 38);
    if (has('bottom')) out.bottom = b(37, 48, 30, 50);
    Object.assign(out, column(small, 70, 49, 27, 49));
  } else {
    if (has('shoes')) out.shoes = b(6, 58, 38, 38);
    if (has('bottom')) out.bottom = b(50, 48, 40, 50);
  }
  return out;
}

export function boxesOverlap(a: Box, c: Box): boolean {
  const eps = 0.001;
  return a.x < c.x + c.w - eps && c.x < a.x + a.w - eps && a.y < c.y + c.h - eps && c.y < a.y + a.h - eps;
}
