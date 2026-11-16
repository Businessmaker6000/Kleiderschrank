// End-to-end check against a running server (default http://localhost:3000) with an EMPTY
// data store: runs first-time setup, signs in, unlocks both profiles, uploads generated test
// garments and verifies sessions, profile separation and persistence over real HTTP.
//
//   npm run dev            (in one terminal, fresh .data directory)
//   node scripts/e2e.mjs   (in another)
//
// Environment: BASE_URL, E2E_PASSWORD, SETUP_CODE (if the server requires one).
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const PASSWORD = process.env.E2E_PASSWORD || 'wardrobe-e2e-passwort';

// ---------- tiny PNG painter (flat garment silhouettes on white) ----------
const W = 360;
const H = 480;

function png(rgb) {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const x of buf) c = table[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** shapes: polygons in a 0..100 x 0..100 box, optionally {circle:[cx,cy,r]}; later shapes may use shade */
function paint(hex, shapes) {
  const base = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const buf = Buffer.alloc(W * H * 3, 255);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x / W) * 100;
      const v = (y / H) * 100;
      for (const s of shapes) {
        const hit = s.circle ? (u - s.circle[0]) ** 2 + ((v - s.circle[1]) * (H / W)) ** 2 < s.circle[2] ** 2 : inPoly(u, v, s.poly);
        if (hit) {
          const k = s.shade ?? 1;
          const i = (y * W + x) * 3;
          buf[i] = Math.min(255, base[0] * k);
          buf[i + 1] = Math.min(255, base[1] * k);
          buf[i + 2] = Math.min(255, base[2] * k);
        }
      }
    }
  }
  return png(buf);
}

const SHAPES = {
  tee: [
    { poly: [[30, 12], [42, 8], [58, 8], [70, 12], [92, 26], [82, 40], [72, 34], [72, 92], [28, 92], [28, 34], [18, 40], [8, 26]] },
    { poly: [[42, 8], [58, 8], [54, 14], [46, 14]], shade: 0.82 },
  ],
  sweater: [
    { poly: [[28, 12], [42, 8], [58, 8], [72, 12], [96, 78], [84, 84], [72, 44], [72, 92], [28, 92], [28, 44], [16, 84], [4, 78]] },
    { poly: [[28, 86], [72, 86], [72, 92], [28, 92]], shade: 0.85 },
    { poly: [[42, 8], [58, 8], [55, 13], [45, 13]], shade: 0.8 },
  ],
  jacket: [
    { poly: [[26, 10], [42, 6], [58, 6], [74, 10], [97, 82], [85, 88], [75, 46], [76, 96], [24, 96], [25, 46], [15, 88], [3, 82]] },
    { poly: [[49, 8], [51, 8], [51, 96], [49, 96]], shade: 0.7 },
    { poly: [[42, 6], [50, 22], [36, 16]], shade: 0.8 },
    { poly: [[58, 6], [50, 22], [64, 16]], shade: 0.8 },
  ],
  pants: [
    { poly: [[26, 4], [74, 4], [80, 96], [56, 96], [50, 30], [44, 96], [20, 96]] },
    { poly: [[26, 4], [74, 4], [74, 9], [26, 9]], shade: 0.82 },
  ],
  shorts: [{ poly: [[24, 20], [76, 20], [82, 70], [54, 70], [50, 42], [46, 70], [18, 70]] }],
  dress: [
    { poly: [[38, 4], [46, 4], [50, 12], [54, 4], [62, 4], [66, 30], [86, 96], [14, 96], [34, 30]] },
    { poly: [[34, 30], [66, 30], [67, 34], [33, 34]], shade: 0.85 },
  ],
  shoes: [
    { poly: [[6, 44], [28, 30], [44, 44], [60, 50], [64, 60], [6, 60]] },
    { poly: [[6, 58], [64, 58], [64, 63], [6, 63]], shade: 0.55 },
    { poly: [[38, 70], [60, 56], [76, 70], [92, 76], [96, 86], [38, 86]] },
    { poly: [[38, 84], [96, 84], [96, 89], [38, 89]], shade: 0.55 },
  ],
  watch: [
    { poly: [[42, 8], [58, 8], [58, 92], [42, 92]], shade: 0.75 },
    { circle: [50, 50, 20] },
    { circle: [50, 50, 14], shade: 1.6 },
  ],
  bag: [
    { poly: [[18, 40], [82, 40], [88, 92], [12, 92]] },
    { poly: [[34, 40], [38, 14], [62, 14], [66, 40], [61, 40], [58, 19], [42, 19], [39, 40]], shade: 0.8 },
  ],
};

// ---------- http client with a cookie jar per "device" ----------
function device() {
  const jar = new Map();
  return async function request(path, { method, body, form, origin } = {}) {
    const headers = { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
    if (body) headers['content-type'] = 'application/json';
    if (origin) headers.origin = origin;
    const res = await fetch(BASE + path, { method: method || (body || form ? 'POST' : 'GET'), headers, body: form || (body ? JSON.stringify(body) : undefined), redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const [k, ...v] = pair.split('=');
      if (v.join('=')) jar.set(k, v.join('='));
      else jar.delete(k);
    }
    const type = res.headers.get('content-type') || '';
    return { status: res.status, headers: res.headers, data: type.includes('json') ? await res.json() : await res.arrayBuffer() };
  };
}

let passed = 0;
async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`FAIL  ${name}\n      ${e.message}`);
    process.exit(1);
  }
}

async function addItem(req, meta, shape, hex) {
  const form = new FormData();
  form.append('image', new Blob([paint(hex, SHAPES[shape])], { type: 'image/png' }), 'x.png');
  form.append('width', String(W));
  form.append('height', String(H));
  form.append('meta', JSON.stringify(meta));
  const r = await req('/api/items', { form });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.item;
}

const KOLE = [
  [{ group: 'tops', type: 'T-Shirt', name: 'Weisses T-Shirt', colors: ['Weiss'], styles: ['Casual', 'Minimalist'], seasons: ['Frühling', 'Sommer'] }, 'tee', '#f1efe9'],
  [{ group: 'tops', type: 'Pullover', name: 'Navy Strickpullover', colors: ['Navy'], material: 'Wolle', styles: ['Classic', 'Old Money'], seasons: ['Herbst', 'Winter'] }, 'sweater', '#1f2a44'],
  [{ group: 'tops', type: 'Hoodie', name: 'Grauer Hoodie', colors: ['Grau'], styles: ['Streetwear', 'Casual'] }, 'sweater', '#9a9a98'],
  [{ group: 'tops', type: 'Hemd', name: 'Hellblaues Hemd', colors: ['Hellblau'], styles: ['Business', 'Smart Casual'] }, 'tee', '#a9c6e4'],
  [{ group: 'bottoms', type: 'Jeans', name: 'Dunkle Jeans', colors: ['Blau'], styles: ['Casual'] }, 'pants', '#2f4a73'],
  [{ group: 'bottoms', type: 'Chino', name: 'Beige Chino', colors: ['Beige'], styles: ['Smart Casual', 'Old Money'] }, 'pants', '#d8c4a5'],
  [{ group: 'bottoms', type: 'Shorts', name: 'Olive Shorts', colors: ['Oliv'], seasons: ['Sommer'] }, 'shorts', '#6b6f47'],
  [{ group: 'outerwear', type: 'Mantel', name: 'Camel Mantel', colors: ['Camel'], styles: ['Classic', 'Old Money'], seasons: ['Herbst', 'Winter'] }, 'jacket', '#b98a56'],
  [{ group: 'outerwear', type: 'Regenjacke', name: 'Olive Regenjacke', colors: ['Oliv'], styles: ['Casual'] }, 'jacket', '#6b6f47'],
  [{ group: 'shoes', type: 'Sneaker', name: 'Weisse Sneaker', colors: ['Weiss'], styles: ['Casual', 'Minimalist'] }, 'shoes', '#e9e6df'],
  [{ group: 'shoes', type: 'Boots', name: 'Braune Boots', colors: ['Braun'], styles: ['Classic'] }, 'shoes', '#6b4a34'],
  [{ group: 'accessories', type: 'Uhr', name: 'Silberne Uhr', colors: ['Silber'] }, 'watch', '#8c9096'],
  [{ group: 'accessories', type: 'Rucksack', name: 'Schwarzer Rucksack', colors: ['Schwarz'] }, 'bag', '#2a2a2a'],
  [{ group: 'accessories', type: 'Mütze', name: 'Graue Mütze', colors: ['Grau'], seasons: ['Herbst', 'Winter'] }, 'bag', '#8c8c8c'],
];
const ALISHA = [
  [{ group: 'dresses', type: 'Kleid', name: 'Mauve Midikleid', colors: ['Mauve'], styles: ['Chic', 'Date Night'] }, 'dress', '#a98794'],
  [{ group: 'tops', type: 'Bluse', name: 'Creme Bluse', colors: ['Creme'], styles: ['Elegant', 'Classic'] }, 'tee', '#eadfca'],
  [{ group: 'tops', type: 'Cardigan', name: 'Rosa Cardigan', colors: ['Rosa'], styles: ['Chic'] }, 'sweater', '#e7b9c0'],
  [{ group: 'bottoms', type: 'Stoffhose', name: 'Taupe Stoffhose', colors: ['Taupe'], styles: ['Elegant', 'Quiet Luxury'] }, 'pants', '#9c8b7b'],
  [{ group: 'outerwear', type: 'Blazer', name: 'Beiger Blazer', colors: ['Beige'], styles: ['Elegant', 'Business'] }, 'jacket', '#d8c4a5'],
  [{ group: 'shoes', type: 'Loafer', name: 'Braune Loafer', colors: ['Braun'], styles: ['Classic'] }, 'shoes', '#6b4a34'],
  [{ group: 'accessories', type: 'Handtasche', name: 'Camel Handtasche', colors: ['Camel'] }, 'bag', '#b98a56'],
];

console.log(`e2e against ${BASE}`);
const phone = device();
const laptop = device();
let koleId, alishaId, koleItems, alishaItems, outfit;

await step('unauthenticated requests are rejected', async () => {
  assert.equal((await phone('/api/items')).status, 401);
  assert.equal((await phone('/api/me')).status, 401);
  assert.ok([307, 308].includes((await phone('/today')).status), 'app pages redirect when locked');
});

await step('first-time setup validates input and signs the device in', async () => {
  assert.equal((await phone('/api/auth/setup', { body: { password: 'kurz', setupCode: process.env.SETUP_CODE } })).status, 400);
  const r = await phone('/api/auth/setup', { body: { password: PASSWORD, setupCode: process.env.SETUP_CODE } });
  assert.equal(r.status, 200, JSON.stringify(r.data) + ' — is the data store empty?');
  assert.equal((await phone('/api/auth/setup', { body: { password: PASSWORD } })).status, 409);
});

await step('session cookies are httpOnly', async () => {
  const r = await laptop('/api/auth/login', { body: { password: PASSWORD } });
  assert.equal(r.status, 200);
  assert.match(r.headers.getSetCookie().join(), /wd_device=.*HttpOnly/i);
  assert.equal((await device()('/api/auth/login', { body: { password: 'falsches-passwort' } })).status, 401);
});

await step('device login alone does not open a profile', async () => {
  assert.equal((await phone('/api/items')).status, 401);
});

await step('PIN 5474 unlocks each profile; wrong PIN does not', async () => {
  const html = new TextDecoder().decode((await phone('/')).data);
  const ids = [...html.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)].map((m) => m[0]);
  assert.ok(ids.length >= 2, 'profile selection lists both profiles');
  for (const id of new Set(ids)) {
    const bad = await device()('/api/auth/unlock', { body: { profileId: id, pin: '5474' } });
    assert.equal(bad.status, 401, 'PIN without device session must fail');
  }
  for (const id of new Set(ids)) {
    assert.equal((await phone('/api/auth/unlock', { body: { profileId: id, pin: '0000' } })).status, 401);
    const r = await phone('/api/auth/unlock', { body: { profileId: id, pin: '5474' } });
    if (r.status !== 200) continue;
    if (r.data.profile.slug === 'kole') koleId = id;
    if (r.data.profile.slug === 'alisha') alishaId = id;
  }
  assert.ok(koleId && alishaId);
  assert.equal((await phone('/api/auth/unlock', { body: { profileId: koleId, pin: '5474' } })).status, 200);
  assert.equal((await laptop('/api/auth/unlock', { body: { profileId: alishaId, pin: '5474' } })).status, 200);
  assert.equal((await phone('/api/me')).data.profile.name, 'Kole');
  assert.equal((await laptop('/api/me')).data.profile.name, 'Alisha');
});

await step('cross-site POST is refused', async () => {
  assert.equal((await phone('/api/auth/lock', { method: 'POST', origin: 'https://evil.example' })).status, 403);
  assert.equal((await phone('/api/me')).status, 200, 'still unlocked');
});

await step('both upload real images', async () => {
  koleItems = [];
  for (const [meta, shape, hex] of KOLE) koleItems.push(await addItem(phone, meta, shape, hex));
  alishaItems = [];
  for (const [meta, shape, hex] of ALISHA) alishaItems.push(await addItem(laptop, meta, shape, hex));
  const bad = new FormData();
  bad.append('image', new Blob(['not an image']), 'x.png');
  bad.append('meta', JSON.stringify({ group: 'tops', type: 'Hemd' }));
  assert.equal((await phone('/api/items', { form: bad })).status, 415);
});

await step('wardrobes are separate', async () => {
  const k = (await phone('/api/items')).data.items;
  const a = (await laptop('/api/items')).data.items;
  assert.equal(k.length, KOLE.length);
  assert.equal(a.length, ALISHA.length);
  assert.ok(!k.some((i) => a.some((j) => j.id === i.id)));
});

await step('images load for the owner only', async () => {
  const p = `/api/images/${koleItems[0].image.path}`;
  const own = await phone(p);
  assert.equal(own.status, 200);
  assert.equal(own.headers.get('content-type'), 'image/png');
  assert.ok(own.data.byteLength > 500);
  assert.equal((await laptop(p)).status, 404, "Alisha must not see Kole's photo");
  assert.equal((await device()(p)).status, 401);
});

await step('editing and deleting across profiles is impossible', async () => {
  assert.equal((await laptop(`/api/items/${koleItems[0].id}`, { method: 'PATCH', body: { name: 'x' } })).status, 404);
  assert.equal((await laptop(`/api/items/${koleItems[0].id}`, { method: 'DELETE' })).status, 404);
  const r = await phone(`/api/items/${koleItems[0].id}`, { method: 'PATCH', body: { favorite: true } });
  assert.equal(r.data.item.favorite, true);
});

await step('outfits: save, foreign pieces refused, boards, duplicate', async () => {
  const pick = (type) => koleItems.find((i) => i.type === type);
  const items = ['Pullover', 'Chino', 'Mantel', 'Boots', 'Uhr'].map((t) => ({ item_id: pick(t).id }));
  assert.equal((await phone('/api/outfits', { body: { name: 'x', items: [...items, { item_id: alishaItems[0].id }] } })).status, 400);
  const board = (await phone('/api/boards', { body: { name: 'Old Money' } })).data.board;
  const r = await phone('/api/outfits', { body: { name: 'Herbst Klassiker', items, styles: ['Old Money', 'Classic'], season: 'Herbst', board_ids: [board.id] } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  outfit = r.data.outfit;
  assert.equal(outfit.items.length, 5);
  assert.deepEqual(outfit.board_ids, [board.id]);
  await phone('/api/outfits', { body: { name: 'Casual Friday', items: ['T-Shirt', 'Jeans', 'Sneaker', 'Rucksack'].map((t) => ({ item_id: pick(t).id })), styles: ['Casual'] } });
  await phone('/api/outfits', { body: { name: 'Regentag', items: ['Hoodie', 'Jeans', 'Regenjacke', 'Boots'].map((t) => ({ item_id: pick(t).id })), styles: ['Streetwear'], occasion: 'Freizeit' } });
  const a = (t) => alishaItems.find((i) => i.type === t);
  await laptop('/api/outfits', { body: { name: 'Dinner', items: ['Kleid', 'Blazer', 'Loafer', 'Handtasche'].map((t) => ({ item_id: a(t).id })), styles: ['Chic'], occasion: 'Dinner' } });
  assert.equal((await phone('/api/outfits')).data.outfits.length, 3);
  assert.equal((await laptop('/api/outfits')).data.outfits.length, 1);
  assert.equal((await laptop('/api/boards')).data.boards.length, 0);
  assert.equal((await laptop(`/api/outfits/${outfit.id}`, { method: 'DELETE' })).status, 200); // no-op on foreign id
  assert.equal((await phone('/api/outfits')).data.outfits.length, 3);
});

await step('everything survives lock, logout and a new device', async () => {
  await phone('/api/auth/lock', { method: 'POST' });
  assert.equal((await phone('/api/items')).status, 401);
  await phone('/api/auth/logout', { method: 'POST' });
  const tablet = device();
  assert.equal((await tablet('/api/auth/login', { body: { password: PASSWORD } })).status, 200);
  assert.equal((await tablet('/api/auth/unlock', { body: { profileId: koleId, pin: '5474' } })).status, 200);
  const items = (await tablet('/api/items')).data.items;
  assert.equal(items.length, KOLE.length);
  assert.ok(items.find((i) => i.id === koleItems[0].id).favorite);
  assert.equal((await tablet('/api/outfits')).data.outfits.length, 3);
  assert.equal((await tablet(`/api/images/${koleItems[3].image.path}`)).status, 200);
  // switching profile on the same device swaps the data completely
  await tablet('/api/auth/lock', { method: 'POST' });
  assert.equal((await tablet('/api/auth/unlock', { body: { profileId: alishaId, pin: '5474' } })).status, 200);
  assert.equal((await tablet('/api/items')).data.items.length, ALISHA.length);
});

await step('weather endpoint answers or fails gracefully', async () => {
  const r = await laptop('/api/weather', { body: { lat: 47.37, lon: 8.54, place: 'Zürich' } });
  assert.ok([200, 503].includes(r.status), `unexpected ${r.status}`);
  if (r.status === 200) assert.equal(typeof r.data.weather.temp, 'number');
  console.log(`      weather: ${r.status === 200 ? `${r.data.weather.temp} °C, ${r.data.weather.label}` : 'service unreachable (fallback path)'}`);
  assert.equal((await laptop('/api/weather', { body: { lat: 'x', lon: 1 } })).status, 400);
});

console.log(`\n${passed} checks passed.`);
