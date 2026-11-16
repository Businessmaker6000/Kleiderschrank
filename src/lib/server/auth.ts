// Access control (framework independent, so it can be tested in plain node).
//
// One shared four-digit PIN opens the app on a device. After that the person picks their
// profile (Kole or Alisha). There is no password. The PIN is stored only as a salted hash
// and checked on the server; repeated wrong attempts lock the entry for a growing time.
//
// The profiles are separate wardrobes, not separate secrets: whoever knows the PIN can
// open either one.
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { db } from './db.ts';
import { hashSecret, verifySecret } from './crypto.ts';
import { ApiError } from './errors.ts';
import { clearFailures, lockedFor, registerFailure } from './ratelimit.ts';
import type { Policy } from './ratelimit.ts';
import type { ProfileSlug, PublicProfile } from '../types.ts';

export const INITIAL_PIN = '5474';

/** per address: 5 wrong PINs, then 1 minute, doubling up to an hour */
const PIN_IP_POLICY: Policy = { max: 5, windowMs: 15 * 60_000, baseLockMs: 60_000 };
/** across all addresses: slows down guessing from many addresses at once */
const PIN_GLOBAL_POLICY: Policy = { max: 20, windowMs: 15 * 60_000, baseLockMs: 10 * 60_000 };
const SETUP_POLICY: Policy = { max: 8, windowMs: 15 * 60_000, baseLockMs: 5 * 60_000 };

export interface AccountRow {
  id: string;
  /** legacy column; no longer used for sign-in */
  password_hash: string;
  session_version: number;
  created_at: string;
}

export interface ProfileRow {
  id: string;
  account_id: string;
  slug: ProfileSlug;
  name: string;
  /** the shared PIN, stored on every profile */
  pin_hash: string;
  pin_changed: boolean;
  created_at: string;
}

const PROFILES: { slug: ProfileSlug; name: string }[] = [
  { slug: 'kole', name: 'Kole' },
  { slug: 'alisha', name: 'Alisha' },
];

export function toPublic(p: ProfileRow): PublicProfile {
  return { id: p.id, slug: p.slug, name: p.name };
}

export async function getAccount(): Promise<AccountRow | null> {
  return (await db().select<AccountRow>('accounts'))[0] || null;
}

export function setupCodeRequired(): boolean {
  return Boolean(process.env.SETUP_CODE) || db().driver === 'supabase';
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function validatePin(pin: unknown): string {
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) throw new ApiError(400, 'Der PIN besteht aus vier Ziffern.');
  return pin;
}

export function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} Sekunden`;
  const m = Math.ceil(seconds / 60);
  return m === 1 ? '1 Minute' : `${m} Minuten`;
}

async function throttle(keys: string[]) {
  for (const key of keys) {
    const wait = await lockedFor(key);
    if (wait > 0) {
      throw new ApiError(429, `Zu viele Versuche. Bitte in ${formatWait(wait)} erneut versuchen.`, { retryAfter: wait });
    }
  }
}

/** First-time setup: creates the account and both profiles with the chosen PIN. */
export async function setupAccount(input: { pin: unknown; setupCode?: unknown }, ip: string): Promise<AccountRow> {
  if (await getAccount()) throw new ApiError(409, 'Die App ist bereits eingerichtet.');
  const key = `setup:${ip}`;
  await throttle([key]);
  if (setupCodeRequired()) {
    const expected = process.env.SETUP_CODE;
    if (!expected) throw new ApiError(500, 'SETUP_CODE ist auf dem Server nicht gesetzt.');
    if (typeof input.setupCode !== 'string' || !safeEqual(input.setupCode, expected)) {
      await registerFailure(key, SETUP_POLICY);
      throw new ApiError(401, 'Der Setup-Code ist nicht korrekt.');
    }
  }
  const pin = validatePin(input.pin);
  const now = new Date().toISOString();
  const account: AccountRow = {
    id: randomUUID(),
    // the column is kept for existing databases; a random value nobody knows
    password_hash: await hashSecret(randomBytes(32).toString('hex')),
    session_version: 1,
    created_at: now,
  };
  await db().insert('accounts', [account as unknown as Record<string, unknown>]);
  const pinHashes = await Promise.all(PROFILES.map(() => hashSecret(pin)));
  const profiles = PROFILES.map((p, i) => ({
    id: randomUUID(),
    account_id: account.id,
    slug: p.slug,
    name: p.name,
    pin_hash: pinHashes[i],
    pin_changed: pin !== INITIAL_PIN,
    created_at: now,
  }));
  await db().insert('profiles', profiles);
  await db().insert(
    'user_preferences',
    profiles.map((p) => ({ profile_id: p.id, use_location: true, city: null, lat: null, lon: null, favorite_styles: [] })),
  );
  await clearFailures(key);
  return account;
}

export async function listProfiles(accountId: string): Promise<ProfileRow[]> {
  const rows = await db().select<ProfileRow>('profiles', { account_id: accountId });
  return rows.sort((a, b) => PROFILES.findIndex((p) => p.slug === a.slug) - PROFILES.findIndex((p) => p.slug === b.slug));
}

export async function getProfile(accountId: string, profileId: string): Promise<ProfileRow | null> {
  return (await db().select<ProfileRow>('profiles', { id: profileId, account_id: accountId }))[0] || null;
}

async function pinMatches(pin: unknown, profiles: ProfileRow[]): Promise<boolean> {
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin) || !profiles.length) return false;
  // every profile carries the same PIN; checking all keeps older databases working
  const results = await Promise.all(profiles.map((p) => verifySecret(pin, p.pin_hash)));
  return results.some(Boolean);
}

/** The front door: checks the shared PIN. Returns the account whose device session may start. */
export async function enterWithPin(pin: unknown, ip: string): Promise<AccountRow> {
  const keys = [`pin:${ip}`, 'pin:global'];
  await throttle(keys);
  const account = await getAccount();
  if (!account) throw new ApiError(409, 'Die App ist noch nicht eingerichtet.');
  if (!(await pinMatches(pin, await listProfiles(account.id)))) {
    const r = await registerFailure(keys[0], PIN_IP_POLICY);
    await registerFailure(keys[1], PIN_GLOBAL_POLICY);
    throw new ApiError(
      401,
      r.retryAfter
        ? `Zu viele Fehlversuche. Gesperrt für ${formatWait(r.retryAfter)}.`
        : `Falscher PIN. Noch ${r.remaining} ${r.remaining === 1 ? 'Versuch' : 'Versuche'}.`,
      { retryAfter: r.retryAfter, remaining: r.remaining },
    );
  }
  await clearFailures(keys[0]);
  return account;
}

/** After the PIN: choosing a profile needs no further secret. */
export async function openProfile(accountId: string, profileId: unknown): Promise<ProfileRow> {
  if (typeof profileId !== 'string') throw new ApiError(400, 'Profil fehlt.');
  const profile = await getProfile(accountId, profileId);
  if (!profile) throw new ApiError(404, 'Profil nicht gefunden.');
  return profile;
}

/** Changes the shared PIN for both profiles and signs out every other device. */
export async function changePin(account: AccountRow, currentPin: unknown, newPin: unknown, ip: string): Promise<AccountRow> {
  await enterWithPin(currentPin, ip);
  const pin = validatePin(newPin);
  for (const p of await listProfiles(account.id)) {
    await db().update('profiles', { id: p.id }, { pin_hash: await hashSecret(pin), pin_changed: true });
  }
  const session_version = account.session_version + 1;
  await db().update('accounts', { id: account.id }, { session_version });
  return { ...account, session_version };
}
