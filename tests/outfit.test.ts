// Generator and collage layout (pure logic, no storage).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import * as gen from '../src/lib/outfit/generator.ts';
import * as layout from '../src/lib/outfit/layout.ts';
import { SLOTS, defaultSlot } from '../src/lib/taxonomy.ts';
import type { Group, Slot } from '../src/lib/taxonomy.ts';
import type { Item } from '../src/lib/types.ts';

let n = 0;
const item = (type: string, group: Group, extra: Partial<Item> = {}): Item => ({
  id: `i${++n}`,
  name: type,
  group,
  type,
  slot: defaultSlot(group, type),
  colors: ['Beige'],
  pattern: null,
  material: null,
  seasons: [],
  styles: [],
  tags: [],
  favorite: false,
  wear_count: 0,
  created_at: new Date(2026, 0, n).toISOString(),
  image: null,
  ...extra,
});

const wardrobe: Item[] = [
  item('T-Shirt', 'tops', { colors: ['Weiss'], styles: ['Casual'] }),
  item('Tanktop', 'tops', { colors: ['Weiss'] }),
  item('Hemd', 'tops', { colors: ['Hellblau'], styles: ['Business', 'Classic'] }),
  item('Pullover', 'tops', { colors: ['Navy'], material: 'Wolle', styles: ['Classic'] }),
  item('Hoodie', 'tops', { colors: ['Grau'], styles: ['Streetwear'] }),
  item('Jeans', 'bottoms', { colors: ['Blau'], styles: ['Casual'] }),
  item('Shorts', 'bottoms', { colors: ['Beige'] }),
  item('Anzughose', 'bottoms', { colors: ['Anthrazit'], styles: ['Business'] }),
  item('Jogginghose', 'bottoms', { colors: ['Grau'], styles: ['Sporty'] }),
  item('Mantel', 'outerwear', { colors: ['Camel'], styles: ['Classic'] }),
  item('Regenjacke', 'outerwear', { colors: ['Oliv'] }),
  item('Blazer', 'outerwear', { colors: ['Navy'], styles: ['Business'] }),
  item('Sneaker', 'shoes', { colors: ['Weiss'], styles: ['Casual'] }),
  item('Sandalen', 'shoes', { colors: ['Braun'] }),
  item('Boots', 'shoes', { colors: ['Braun'] }),
  item('Lederschuhe', 'shoes', { colors: ['Schwarz'], styles: ['Business'] }),
  item('Uhr', 'accessories', { colors: ['Silber'] }),
  item('Rucksack', 'accessories', { colors: ['Schwarz'] }),
  item('Mütze', 'accessories', { colors: ['Grau'] }),
  item('Sonnenbrille', 'accessories', { colors: ['Schwarz'] }),
];
const byType = (t: string) => wardrobe.find((i) => i.type === t)!;
const typeIn = (sel: gen.Selection, slot: Slot) => wardrobe.find((i) => i.id === sel[slot])?.type;
const run = (opts: gen.GenOptions, times = 30) =>
  Array.from({ length: times }, (_, k) => gen.generateOutfit(wardrobe, { ...opts, rng: gen.seededRng(`seed-${k}`) })!);

describe('compartments', () => {
  test('pieces land in the compartment they are worn in', () => {
    assert.equal(byType('T-Shirt').slot, 'top');
    assert.equal(byType('Hemd').slot, 'top');
    assert.equal(byType('Pullover').slot, 'layer');
    assert.equal(byType('Hoodie').slot, 'layer');
    assert.equal(byType('Mütze').slot, 'head');
    assert.equal(byType('Sonnenbrille').slot, 'head');
    assert.equal(byType('Uhr').slot, 'accessory');
    assert.equal(byType('Rucksack').slot, 'bag');
    assert.equal(byType('Mantel').slot, 'outerwear');
    assert.deepEqual(SLOTS.slice(0, 4), ['head', 'outerwear', 'layer', 'top'], 'head to toe order');
  });
});

describe('outfit generator', () => {
  test('returns null for an empty wardrobe and works with a single piece', () => {
    assert.equal(gen.generateOutfit([], { mode: 'random' }), null);
    assert.deepEqual(gen.generateOutfit([wardrobe[0]], { mode: 'random' })!.selection, { top: wardrobe[0].id });
  });

  test('only uses pieces from the given wardrobe, each in its own compartment', () => {
    const ids = new Set(wardrobe.map((i) => i.id));
    for (const g of run({ mode: 'surprise' }, 60)) {
      for (const [slot, id] of Object.entries(g.selection)) {
        assert.ok(ids.has(id!));
        assert.equal(wardrobe.find((i) => i.id === id)!.slot, slot);
      }
      assert.ok(g.selection.top && g.selection.bottom && g.selection.shoes);
      assert.ok(g.score > 0 && g.score <= 1);
    }
  });

  test('a wardrobe without shirts uses a pullover as the upper piece', () => {
    const noShirts = wardrobe.filter((i) => i.slot !== 'top');
    for (let k = 0; k < 10; k++) {
      const g = gen.generateOutfit(noShirts, { mode: 'random', rng: gen.seededRng(`n${k}`) })!;
      assert.ok(g.selection.layer && !g.selection.top);
    }
  });

  test('cold weather: jacket and pullover, never shorts, sandals or sunglasses', () => {
    const cold = { temp: 1, feels: -2, rainProb: 10, wind: 10, code: 3 };
    const results = run({ mode: 'weather', weather: cold });
    for (const g of results) {
      assert.ok(g.selection.outerwear, 'jacket expected');
      assert.notEqual(typeIn(g.selection, 'bottom'), 'Shorts');
      assert.notEqual(typeIn(g.selection, 'shoes'), 'Sandalen');
      assert.notEqual(typeIn(g.selection, 'head'), 'Sonnenbrille');
      assert.match(g.explanation, /1 °C/);
    }
    const layered = results.filter((g) => g.selection.layer).length;
    assert.ok(layered >= results.length * 0.8, `pullover in ${layered}/${results.length}`);
  });

  test('hot weather: no jacket, no pullover, no boots, no beanie', () => {
    const hot = { temp: 30, feels: 31, rainProb: 0, wind: 5, code: 0 };
    for (const g of run({ mode: 'weather', weather: hot })) {
      assert.equal(g.selection.outerwear, undefined);
      assert.equal(g.selection.layer, undefined);
      assert.notEqual(typeIn(g.selection, 'shoes'), 'Boots');
      assert.notEqual(typeIn(g.selection, 'head'), 'Mütze');
    }
  });

  test('rain: no sandals, rain-proof pieces preferred', () => {
    const rain = { temp: 14, feels: 13, rainProb: 90, wind: 15, code: 63 };
    const results = run({ mode: 'weather', weather: rain });
    for (const g of results) assert.notEqual(typeIn(g.selection, 'shoes'), 'Sandalen');
    const proof = results.filter((g) => typeIn(g.selection, 'outerwear') === 'Regenjacke' || typeIn(g.selection, 'shoes') === 'Boots').length;
    assert.ok(proof >= results.length * 0.7, `rain-proof in ${proof}/${results.length}`);
  });

  test('style and occasion steer the result', () => {
    for (const g of run({ mode: 'occasion', occasion: 'Arbeit', weather: { temp: 16, feels: 16, rainProb: 0, wind: 5, code: 1 } })) {
      assert.notEqual(typeIn(g.selection, 'bottom'), 'Jogginghose');
      assert.notEqual(typeIn(g.selection, 'layer'), 'Hoodie');
    }
    const biz = run({ mode: 'style', style: 'Business' });
    const hits = biz.filter((g) => typeIn(g.selection, 'bottom') === 'Anzughose').length;
    assert.ok(hits >= biz.length * 0.7, `business trousers in ${hits}/${biz.length}`);
  });

  test('time of day: evenings dress up compared with a weekend afternoon', () => {
    const mild = { temp: 17, feels: 17, rainProb: 0, wind: 5, code: 1 };
    const formality = (when: { hour: number; weekend: boolean }) => {
      const results = run({ mode: 'auto', weather: mild, when }, 40);
      const values = results.flatMap((g) => (['top', 'bottom', 'shoes'] as Slot[]).map((s) => gen.metaOf(wardrobe.find((i) => i.id === g.selection[s])!).formality));
      return values.reduce((a, c) => a + c, 0) / values.length;
    };
    const evening = formality({ hour: 20, weekend: false });
    const weekend = formality({ hour: 14, weekend: true });
    assert.ok(evening > weekend + 0.4, `evening ${evening.toFixed(2)} vs weekend ${weekend.toFixed(2)}`);
    assert.match(run({ mode: 'auto', weather: mild, when: { hour: 20, weekend: false } }, 1)[0].explanation, /Abend/);
  });

  test('locked pieces survive regeneration; result differs from the current outfit', () => {
    const locked = { layer: byType('Hoodie').id, shoes: byType('Boots').id };
    let current: gen.Selection = {};
    for (let k = 0; k < 20; k++) {
      const g = gen.generateOutfit(wardrobe, { mode: 'random', locked, current, rng: gen.seededRng(`l${k}`) })!;
      assert.equal(g.selection.layer, locked.layer);
      assert.equal(g.selection.shoes, locked.shoes);
      assert.notDeepEqual(g.selection, current);
      current = g.selection;
    }
  });

  test('arrows cycle through every piece of a compartment and wrap around', () => {
    const tops = gen.candidatesFor(wardrobe, 'top');
    let sel: gen.Selection = { top: tops[0].id, shoes: byType('Sneaker').id };
    const seen = [sel.top];
    for (let k = 0; k < tops.length; k++) {
      sel = gen.cycleSlot(wardrobe, sel, 'top', 1);
      seen.push(sel.top);
    }
    assert.equal(new Set(seen).size, tops.length);
    assert.equal(seen.at(-1), tops[0].id);
    assert.equal(gen.cycleSlot(wardrobe, sel, 'top', -1).top, tops.at(-1)!.id);
    assert.equal(sel.shoes, byType('Sneaker').id);
    // an empty compartment starts at the first piece
    assert.equal(gen.cycleSlot(wardrobe, {}, 'head', 1).head, gen.candidatesFor(wardrobe, 'head')[0].id);
  });

  test('same seed gives the same outfit', () => {
    const a = gen.generateOutfit(wardrobe, { mode: 'weather', rng: gen.seededRng('2026-11-16') })!;
    const c = gen.generateOutfit(wardrobe, { mode: 'weather', rng: gen.seededRng('2026-11-16') })!;
    assert.deepEqual(a.selection, c.selection);
  });

  test('dresses replace shirt and trousers', () => {
    const g = gen.generateOutfit([item('Kleid', 'dresses'), item('Heels', 'shoes')], { mode: 'random' })!;
    assert.ok(g.selection.dress && g.selection.shoes && !g.selection.top);
  });
});

describe('collage layout', () => {
  test('for every possible combination: each piece gets a box, inside the canvas, without overlap', () => {
    let checked = 0;
    for (let mask = 1; mask < 1 << SLOTS.length; mask++) {
      const slots = SLOTS.filter((_, i) => mask & (1 << i));
      // a dress never appears together with shirt or trousers
      if (slots.includes('dress') && (slots.includes('top') || slots.includes('bottom'))) continue;
      const boxes = layout.collageLayout(slots);
      assert.deepEqual(Object.keys(boxes).sort(), [...slots].sort(), `missing box for ${slots.join('+')}`);
      const list = Object.entries(boxes);
      for (const [slot, box] of list) {
        assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= 100.001 && box.y + box.h <= 100.001, `${slot} out of bounds in ${slots.join('+')}`);
        assert.ok(box.w >= 15 && box.h >= 12, `${slot} too small in ${slots.join('+')}: ${box.w}x${box.h}`);
      }
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++)
          assert.ok(!layout.boxesOverlap(list[i][1], list[j][1]), `${list[i][0]} overlaps ${list[j][0]} in ${slots.join('+')}`);
      checked++;
    }
    assert.ok(checked > 200);
  });
});
