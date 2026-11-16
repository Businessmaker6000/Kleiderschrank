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
  const account = await auth.setupAccount({ pin: '5474' }, 'test');
  accountId = account.id;
  const profiles = await auth.listProfiles(account.id);
  kole = profiles.find((p) => p.slug === 'kole')!.id;
  alisha = profiles.find((p) => p.slug === 'alisha')!.id;
});

after(() => rmSync(dir, { recursive: true, force: true }));

const status = (code: number) => (e: unknown) => (e as { status?: number }).status === code;

describe('access with the shared PIN', () => {
  test('setup creates exactly two profiles, validates the PIN and cannot run twice', async () => {
    const profiles = await auth.listProfiles(accountId);
    assert.deepEqual(profiles.map((p) => p.name), ['Kole', 'Alisha']);
    await assert.rejects(auth.setupAccount({ pin: '1234' }, 'test'), status(409));
  });

  test('the PIN is stored hashed, never in clear text', async () => {
    const raw = readFileSync(path.join(dir, 'db.json'), 'utf8');
    assert.ok(!raw.includes('5474'));
    const profiles = await auth.listProfiles(accountId);
    assert.match(profiles[0].pin_hash, /^scrypt\$/);
    assert.notEqual(profiles[0].pin_hash, profiles[1].pin_hash, 'same PIN must give different hashes (salt)');
  });

  test('only the right PIN opens the app', async () => {
    assert.equal((await auth.enterWithPin('5474', 'ip-a')).id, accountId);
    await assert.rejects(auth.enterWithPin('0000', 'ip-a'), status(401));
    await assert.rejects(auth.enterWithPin('54740', 'ip-a'), status(401));
    await assert.rejects(auth.enterWithPin('', 'ip-a'), status(401));
    await assert.rejects(auth.enterWithPin(5474, 'ip-a'), status(401));
  });

  test('five wrong PINs lock that address, even for the right PIN; other addresses still work', async () => {
    for (let i = 0; i < 5; i++) await assert.rejects(auth.enterWithPin('1111', 'ip-b'), status(401));
    await assert.rejects(auth.enterWithPin('5474', 'ip-b'), status(429));
    assert.ok(await auth.enterWithPin('5474', 'ip-c'));
  });

  test('guessing from many addresses trips the global lock', async () => {
    await db().remove('rate_limits', { key: 'pin:global' });
    for (let i = 0; i < 20; i++) await assert.rejects(auth.enterWithPin('2222', `many-${i}`), status(401));
    await assert.rejects(auth.enterWithPin('5474', 'fresh-address'), status(429));
    await db().remove('rate_limits', { key: 'pin:global' });
    assert.ok(await auth.enterWithPin('5474', 'fresh-address'));
  });

  test('after the PIN either profile can be opened, but only profiles of this account', async () => {
    assert.equal((await auth.openProfile(accountId, kole)).slug, 'kole');
    assert.equal((await auth.openProfile(accountId, alisha)).slug, 'alisha');
    await assert.rejects(auth.openProfile(accountId, 'does-not-exist'), status(404));
    await assert.rejects(auth.openProfile('other-account', kole), status(404));
    await assert.rejects(auth.openProfile(accountId, undefined), status(400));
  });

  test('the PIN can be changed for both profiles; the old one stops working and sessions are renewed', async () => {
    const account = (await auth.getAccount())!;
    await assert.rejects(auth.changePin(account, '0000', '1234', 'ip-d'), status(401));
    await assert.rejects(auth.changePin(account, '5474', '12a4', 'ip-d'), status(400));
    const updated = await auth.changePin(account, '5474', '1234', 'ip-d');
    assert.equal(updated.session_version, account.session_version + 1);
    await assert.rejects(auth.enterWithPin('5474', 'ip-e'), status(401));
    assert.ok(await auth.enterWithPin('1234', 'ip-e'));
    const profiles = await auth.listProfiles(accountId);
    assert.ok(profiles.every((p) => p.pin_changed));
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
    assert.equal(koleItem.slot, 'layer');
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
    assert.deepEqual(outfit.items, [{ slot: 'layer', item_id: koleItem.id }]);
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
