// Run with: npm test  (node's built-in test runner, local file driver in a temp directory)
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { deflateSync } from 'node:zlib';

const dir = mkdtempSync(path.join(tmpdir(), 'wardrobe-test-'));
process.env.DATA_DIR = dir;
delete process.env.SUPABASE_URL;
delete process.env.SETUP_CODE;

const auth = await import('../src/lib/server/auth.ts');
const repo = await import('../src/lib/server/repo.ts');
const { db } = await import('../src/lib/server/db.ts');
const crypto = await import('../src/lib/server/crypto.ts');
const gen = await import('../src/lib/outfit/generator.ts');
const layout = await import('../src/lib/outfit/layout.ts');
import type { Item } from '../src/lib/types.ts';

/** Minimal valid 1x1 PNG. */
function png(): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from([0, 200, 180, 150]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let kole: string;
let alisha: string;
let accountId: string;

before(async () => {
  const account = await auth.setupAccount({ password: 'ein-langes-passwort' }, 'test');
  accountId = account.id;
  const profiles = await auth.listProfiles(account.id);
  kole = profiles.find((p) => p.slug === 'kole')!.id;
  alisha = profiles.find((p) => p.slug === 'alisha')!.id;
});

after(() => rmSync(dir, { recursive: true, force: true }));

const status = (code: number) => (e: unknown) => (e as { status?: number }).status === code;

describe('authentication', () => {
  test('setup creates exactly two profiles and cannot run twice', async () => {
    const profiles = await auth.listProfiles(accountId);
    assert.deepEqual(profiles.map((p) => p.name), ['Kole', 'Alisha']);
    await assert.rejects(auth.setupAccount({ password: 'noch-ein-passwort' }, 'test'), status(409));
  });

  test('secrets are stored hashed, never in clear text', async () => {
    const raw = readFileSync(path.join(dir, 'db.json'), 'utf8');
    assert.ok(!raw.includes('5474'));
    assert.ok(!raw.includes('ein-langes-passwort'));
    const profiles = await auth.listProfiles(accountId);
    assert.match(profiles[0].pin_hash, /^scrypt\$/);
    assert.notEqual(profiles[0].pin_hash, profiles[1].pin_hash, 'same PIN must give different hashes (salt)');
  });

  test('login accepts the right password only', async () => {
    await assert.rejects(auth.login('falsch-falsch', 'ip-a'), status(401));
    assert.equal((await auth.login('ein-langes-passwort', 'ip-a')).id, accountId);
  });

  test('login locks after repeated failures', async () => {
    for (let i = 0; i < 8; i++) await assert.rejects(auth.login('x', 'ip-b'));
    await assert.rejects(auth.login('ein-langes-passwort', 'ip-b'), status(429));
    // another address is unaffected
    assert.ok(await auth.login('ein-langes-passwort', 'ip-c'));
  });

  test('initial PIN 5474 unlocks, wrong PIN does not', async () => {
    assert.equal((await auth.unlockProfile(accountId, kole, '5474')).slug, 'kole');
    await assert.rejects(auth.unlockProfile(accountId, kole, '0000'), status(401));
    await assert.rejects(auth.unlockProfile(accountId, kole, '54740'), status(401));
    await assert.rejects(auth.unlockProfile('other-account', kole, '5474'), status(404));
  });

  test('five wrong PINs lock the profile, even for the right PIN; the other profile stays usable', async () => {
    await auth.unlockProfile(accountId, alisha, '5474'); // resets counter
    for (let i = 0; i < 5; i++) await assert.rejects(auth.unlockProfile(accountId, alisha, '1111'), status(401));
    await assert.rejects(auth.unlockProfile(accountId, alisha, '5474'), status(429));
    assert.ok(await auth.unlockProfile(accountId, kole, '5474'));
    await db().remove('rate_limits', { key: `pin:${alisha}` });
  });

  test('PIN can be changed and the old one stops working', async () => {
    const profile = (await auth.getProfile(accountId, kole))!;
    await assert.rejects(auth.changePin(profile, '0000', '1234'), status(401));
    await assert.rejects(auth.changePin(profile, '5474', '12a4'), status(400));
    await auth.changePin(profile, '5474', '1234');
    await assert.rejects(auth.unlockProfile(accountId, kole, '5474'), status(401));
    assert.ok(await auth.unlockProfile(accountId, kole, '1234'));
    assert.ok(await auth.unlockProfile(accountId, alisha, '5474'), "Alisha's PIN is untouched");
  });

  test('session tokens verify and reject tampering', async () => {
    const token = await crypto.signToken({ pid: kole }, 60);
    assert.equal((await crypto.verifyToken<{ pid: string }>(token))?.pid, kole);
    assert.equal(await crypto.verifyToken(token.slice(0, -3) + 'abc'), null);
    assert.equal(await crypto.verifyToken(await crypto.signToken({ pid: kole }, -10)), null);
  });
});

describe('profile separation', () => {
  let koleItem: Item;
  let alishaItem: Item;

  test('uploads are stored per profile', async () => {
    koleItem = await repo.createItem(kole, { group: 'tops', type: 'Pullover', name: 'Strick', colors: ['Beige'] }, { data: png(), width: 1, height: 1 });
    alishaItem = await repo.createItem(alisha, { group: 'dresses', type: 'Kleid', colors: ['Mauve'] }, { data: png(), width: 1, height: 1 });
    assert.deepEqual((await repo.listItems(kole)).map((i) => i.id), [koleItem.id]);
    assert.deepEqual((await repo.listItems(alisha)).map((i) => i.id), [alishaItem.id]);
    assert.equal(koleItem.slot, 'top');
    assert.equal(alishaItem.slot, 'dress');
    assert.equal(alishaItem.name, 'Kleid', 'name falls back to the type');
  });

  test('images are only readable by their owner', async () => {
    assert.ok(await repo.readImage(kole, koleItem.image!.path));
    assert.equal(await repo.readImage(alisha, koleItem.image!.path), null);
    assert.equal(await repo.readImage(kole, `${kole}/../${alisha}/x.png`), null);
  });

  test('one profile cannot edit or delete the other one’s pieces', async () => {
    await assert.rejects(repo.updateItem(alisha, koleItem.id, { name: 'Hack' }), status(404));
    await assert.rejects(repo.deleteItem(alisha, koleItem.id), status(404));
    assert.equal((await repo.listItems(kole))[0].name, 'Strick');
  });

  test('an outfit cannot contain foreign pieces', async () => {
    await assert.rejects(repo.createOutfit(kole, { name: 'x', items: [{ item_id: alishaItem.id }] }), status(400));
    await assert.rejects(repo.createOutfit(kole, { name: 'x', items: [{ item_id: koleItem.id }, { item_id: alishaItem.id }] }), status(400));
    await assert.rejects(repo.createOutfit(kole, { name: 'x', items: [] }), status(400));
  });

  test('outfits, boards and preferences stay separate and persist', async () => {
    const board = await repo.createBoard(kole, { name: 'Winter' });
    const outfit = await repo.createOutfit(kole, { name: 'Montag', items: [{ item_id: koleItem.id }], styles: ['Classic', 'Unsinn'], board_ids: [board.id] });
    assert.deepEqual(outfit.styles, ['Classic']);
    assert.deepEqual(outfit.board_ids, [board.id]);
    assert.deepEqual(outfit.items, [{ slot: 'top', item_id: koleItem.id }]);
    assert.equal((await repo.listOutfits(alisha)).length, 0);
    assert.equal((await repo.listBoards(alisha)).length, 0);
    await assert.rejects(repo.updateOutfit(alisha, outfit.id, { name: 'Hack' }), status(404));
    await repo.deleteOutfit(alisha, outfit.id); // no-op for a foreign id
    assert.equal((await repo.listOutfits(kole)).length, 1);

    await repo.updatePrefs(kole, { city: 'Zürich', lat: 47.37, lon: 8.54 });
    assert.equal((await repo.getPrefs(kole)).city, 'Zürich');
    assert.equal((await repo.getPrefs(alisha)).city, null);

    // a second, fresh process reading the same files sees everything
    const raw = JSON.parse(readFileSync(path.join(dir, 'db.json'), 'utf8'));
    assert.equal(raw.outfits.length, 1);
    assert.equal(raw.clothing_images.length, 2);

    const copy = await repo.duplicateOutfit(kole, outfit.id);
    assert.equal(copy.name, 'Montag (Kopie)');
    const worn = await repo.wearOutfit(kole, outfit.id);
    assert.equal(worn.worn_count, 1);
    assert.equal((await repo.listItems(kole))[0].wear_count, 1);
  });

  test('deleting a piece removes its image and empties dependent outfits', async () => {
    const p = koleItem.image!.path;
    await repo.deleteItem(kole, koleItem.id);
    assert.equal((await repo.listItems(kole)).length, 0);
    assert.equal(await db().getFile(p), null);
    assert.equal((await repo.listOutfits(kole)).length, 0);
    assert.equal((await repo.listItems(alisha)).length, 1);
  });

  test('uploads that are not images are rejected', async () => {
    await assert.rejects(repo.createItem(kole, { group: 'tops', type: 'Hemd' }, { data: Buffer.from('<svg/>'), width: 1, height: 1 }), status(415));
    await assert.rejects(repo.createItem(kole, { group: 'nope', type: 'Hemd' }, { data: png(), width: 1, height: 1 }), status(400));
  });
});

describe('outfit generator', () => {
  let n = 0;
  const item = (type: string, group: Item['group'], slot: Item['slot'], extra: Partial<Item> = {}): Item => ({
    id: `i${++n}`,
    name: type,
    group,
    type,
    slot,
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
    item('T-Shirt', 'tops', 'top', { colors: ['Weiss'], styles: ['Casual'] }),
    item('Tanktop', 'tops', 'top', { colors: ['Weiss'] }),
    item('Pullover', 'tops', 'top', { colors: ['Navy'], material: 'Wolle', styles: ['Classic'] }),
    item('Hemd', 'tops', 'top', { colors: ['Hellblau'], styles: ['Business', 'Classic'] }),
    item('Hoodie', 'tops', 'top', { colors: ['Grau'], styles: ['Streetwear'] }),
    item('Jeans', 'bottoms', 'bottom', { colors: ['Blau'], styles: ['Casual'] }),
    item('Shorts', 'bottoms', 'bottom', { colors: ['Beige'] }),
    item('Anzughose', 'bottoms', 'bottom', { colors: ['Anthrazit'], styles: ['Business'] }),
    item('Jogginghose', 'bottoms', 'bottom', { colors: ['Grau'], styles: ['Sporty'] }),
    item('Mantel', 'outerwear', 'outerwear', { colors: ['Camel'], styles: ['Classic'] }),
    item('Regenjacke', 'outerwear', 'outerwear', { colors: ['Oliv'] }),
    item('Blazer', 'outerwear', 'outerwear', { colors: ['Navy'], styles: ['Business'] }),
    item('Sneaker', 'shoes', 'shoes', { colors: ['Weiss'], styles: ['Casual'] }),
    item('Sandalen', 'shoes', 'shoes', { colors: ['Braun'] }),
    item('Boots', 'shoes', 'shoes', { colors: ['Braun'] }),
    item('Lederschuhe', 'shoes', 'shoes', { colors: ['Schwarz'], styles: ['Business'] }),
    item('Uhr', 'accessories', 'accessory', { colors: ['Silber'] }),
    item('Rucksack', 'accessories', 'bag', { colors: ['Schwarz'] }),
  ];
  const ids = new Set(wardrobe.map((i) => i.id));
  const typeIn = (sel: Record<string, string | undefined>, slot: string) => wardrobe.find((i) => i.id === sel[slot])?.type;
  const run = (opts: Parameters<typeof gen.generateOutfit>[1], times = 30) =>
    Array.from({ length: times }, (_, k) => gen.generateOutfit(wardrobe, { ...opts, rng: gen.seededRng(`seed-${k}`) })!);

  test('returns null for an empty wardrobe and works with a single piece', () => {
    assert.equal(gen.generateOutfit([], { mode: 'random' }), null);
    const one = gen.generateOutfit([wardrobe[0]], { mode: 'random' })!;
    assert.deepEqual(one.selection, { top: wardrobe[0].id });
  });

  test('only uses pieces from the given wardrobe, each in its own slot', () => {
    for (const g of run({ mode: 'surprise' }, 60)) {
      for (const [slot, id] of Object.entries(g.selection)) {
        assert.ok(ids.has(id!));
        assert.equal(wardrobe.find((i) => i.id === id)!.slot, slot);
      }
      assert.ok(g.selection.top && g.selection.bottom && g.selection.shoes);
      assert.ok(g.score > 0 && g.score <= 1);
    }
  });

  test('cold weather: warm layers and outerwear, never shorts or sandals', () => {
    const cold = { temp: 1, feels: -2, rainProb: 10, wind: 10, code: 3 };
    for (const g of run({ mode: 'weather', weather: cold })) {
      assert.ok(g.selection.outerwear, 'outerwear expected');
      assert.notEqual(typeIn(g.selection, 'bottom'), 'Shorts');
      assert.notEqual(typeIn(g.selection, 'shoes'), 'Sandalen');
      assert.notEqual(typeIn(g.selection, 'top'), 'Tanktop');
      assert.match(g.explanation, /1 °C/);
    }
  });

  test('hot weather: no outerwear, no wool pullover, no boots', () => {
    const hot = { temp: 30, feels: 31, rainProb: 0, wind: 5, code: 0 };
    for (const g of run({ mode: 'weather', weather: hot })) {
      assert.equal(g.selection.outerwear, undefined);
      assert.notEqual(typeIn(g.selection, 'top'), 'Pullover');
      assert.notEqual(typeIn(g.selection, 'shoes'), 'Boots');
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
      assert.notEqual(typeIn(g.selection, 'top'), 'Hoodie');
    }
    const biz = run({ mode: 'style', style: 'Business' });
    const hits = biz.filter((g) => typeIn(g.selection, 'bottom') === 'Anzughose').length;
    assert.ok(hits >= biz.length * 0.7, `business trousers in ${hits}/${biz.length}`);
  });

  test('locked pieces survive regeneration; result differs from the current outfit', () => {
    const locked = { top: wardrobe[4].id, shoes: wardrobe[14].id };
    let current: Record<string, string | undefined> = {};
    for (let k = 0; k < 20; k++) {
      const g = gen.generateOutfit(wardrobe, { mode: 'random', locked, current, rng: gen.seededRng(`l${k}`) })!;
      assert.equal(g.selection.top, locked.top);
      assert.equal(g.selection.shoes, locked.shoes);
      assert.notDeepEqual(g.selection, current);
      current = g.selection;
    }
  });

  test('arrows cycle through every piece of a slot and wrap around', () => {
    const tops = gen.candidatesFor(wardrobe, 'top');
    let sel: Record<string, string | undefined> = { top: tops[0].id, shoes: wardrobe[12].id };
    const seen = [sel.top];
    for (let k = 0; k < tops.length; k++) {
      sel = gen.cycleSlot(wardrobe, sel, 'top', 1);
      seen.push(sel.top);
    }
    assert.equal(new Set(seen).size, tops.length);
    assert.equal(seen.at(-1), tops[0].id);
    assert.equal(gen.cycleSlot(wardrobe, sel, 'top', -1).top, tops.at(-1)!.id);
    assert.equal(sel.shoes, wardrobe[12].id);
  });

  test('same seed gives the same outfit', () => {
    const a = gen.generateOutfit(wardrobe, { mode: 'weather', rng: gen.seededRng('2026-11-16') })!;
    const b = gen.generateOutfit(wardrobe, { mode: 'weather', rng: gen.seededRng('2026-11-16') })!;
    assert.deepEqual(a.selection, b.selection);
  });

  test('dresses replace top and bottom', () => {
    const dressOnly = [item('Kleid', 'dresses', 'dress'), item('Heels', 'shoes', 'shoes')];
    const g = gen.generateOutfit(dressOnly, { mode: 'random' })!;
    assert.ok(g.selection.dress && g.selection.shoes && !g.selection.top);
  });
});

describe('collage layout', () => {
  test('no template lets two pieces overlap or leave the canvas', () => {
    for (const [name, template] of Object.entries(layout.ALL_TEMPLATES)) {
      const boxes = Object.values(template);
      for (const box of boxes) {
        assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= 100 && box.y + box.h <= 100, `${name} out of bounds`);
      }
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) assert.ok(!layout.boxesOverlap(boxes[i], boxes[j]), `${name}: overlap`);
    }
  });

  test('every slot of an outfit gets a box', () => {
    const cases: Item['slot'][][] = [
      ['top', 'bottom', 'shoes'],
      ['top', 'bottom', 'shoes', 'outerwear', 'accessory', 'bag'],
      ['dress', 'shoes', 'bag'],
      ['dress', 'outerwear', 'shoes', 'accessory'],
      ['top', 'bottom', 'outerwear', 'shoes'],
    ];
    for (const slots of cases) assert.deepEqual(Object.keys(layout.collageLayout(slots)).sort(), [...slots].sort());
  });
});
