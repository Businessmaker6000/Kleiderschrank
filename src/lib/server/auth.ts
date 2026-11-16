// Account + profile authentication (framework independent, so it can be tested in plain node).
//
// Two layers:
//  1. Household account: one password, verified server-side, gives a device a long-lived session.
//  2. Profile PIN: four digits, hashed server-side, unlocks one profile inside that device session.
// The PIN is a convenience lock between the two people — never the only barrier to the outside.
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { db } from './db.ts';
import { hashSecret, verifySecret } from './crypto.ts';
import { ApiError } from './errors.ts';
import { GLOBAL_LOGIN_POLICY, LOGIN_POLICY, PIN_POLICY, clearFailures, lockedFor, registerFailure } from './ratelimit.ts';
import type { ProfileSlug, PublicProfile } from '../types.ts';

export const INITIAL_PIN = '5474';

export interface AccountRow {
  id: string;
  password_hash: string;
  session_version: number;
  created_at: string;
}

export interface ProfileRow {
  id: string;
  account_id: string;
  slug: ProfileSlug;
  name: string;
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

function validatePassword(password: unknown): string {
  if (typeof password !== 'string' || password.length < 10 || password.length > 200) {
    throw new ApiError(400, 'Das Passwort muss mindestens 10 Zeichen lang sein.');
  }
  return password;
}

function validatePin(pin: unknown): string {
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) throw new ApiError(400, 'Der PIN besteht aus vier Ziffern.');
  return pin;
}

async function throttle(keys: string[]) {
  for (const key of keys) {
    const wait = await lockedFor(key);
    if (wait > 0) {
      throw new ApiError(429, `Zu viele Versuche. Bitte in ${formatWait(wait)} erneut versuchen.`, { retryAfter: wait });
    }
  }
}

export function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} Sekunden`;
  const m = Math.ceil(seconds / 60);
  return m === 1 ? '1 Minute' : `${m} Minuten`;
}

/** First-time setup: creates the household account and both profiles with the initial PIN. */
export async function setupAccount(input: { password: unknown; setupCode?: unknown }, ip: string): Promise<AccountRow> {
  if (await getAccount()) throw new ApiError(409, 'Die App ist bereits eingerichtet.');
  const key = `setup:${ip}`;
  await throttle([key]);
  if (setupCodeRequired()) {
    const expected = process.env.SETUP_CODE;
    if (!expected) throw new ApiError(500, 'SETUP_CODE ist auf dem Server nicht gesetzt.');
    if (typeof input.setupCode !== 'string' || !safeEqual(input.setupCode, expected)) {
      await registerFailure(key, LOGIN_POLICY);
      throw new ApiError(401, 'Der Setup-Code ist nicht korrekt.');
    }
  }
  const password = validatePassword(input.password);
  const now = new Date().toISOString();
  const account: AccountRow = { id: randomUUID(), password_hash: await hashSecret(password), session_version: 1, created_at: now };
  await db().insert('accounts', [account as unknown as Record<string, unknown>]);
  const pinHashes = await Promise.all(PROFILES.map(() => hashSecret(INITIAL_PIN)));
  const profiles = PROFILES.map((p, i) => ({
    id: randomUUID(),
    account_id: account.id,
    slug: p.slug,
    name: p.name,
    pin_hash: pinHashes[i],
    pin_changed: false,
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

export async function login(password: unknown, ip: string): Promise<AccountRow> {
  const keys = [`login:${ip}`, 'login:global'];
  await throttle(keys);
  const account = await getAccount();
  if (!account) throw new ApiError(409, 'Die App ist noch nicht eingerichtet.');
  const ok = typeof password === 'string' && password.length <= 200 && (await verifySecret(password, account.password_hash));
  if (!ok) {
    const r = await registerFailure(keys[0], LOGIN_POLICY);
    await registerFailure(keys[1], GLOBAL_LOGIN_POLICY);
    throw new ApiError(
      401,
      r.retryAfter ? `Zu viele Versuche. Bitte in ${formatWait(r.retryAfter)} erneut versuchen.` : 'Das Passwort ist nicht korrekt.',
      { retryAfter: r.retryAfter },
    );
  }
  await clearFailures(keys[0]);
  return account;
}

export async function listProfiles(accountId: string): Promise<ProfileRow[]> {
  const rows = await db().select<ProfileRow>('profiles', { account_id: accountId });
  return rows.sort((a, b) => PROFILES.findIndex((p) => p.slug === a.slug) - PROFILES.findIndex((p) => p.slug === b.slug));
}

export async function getProfile(accountId: string, profileId: string): Promise<ProfileRow | null> {
  return (await db().select<ProfileRow>('profiles', { id: profileId, account_id: accountId }))[0] || null;
}

export async function unlockProfile(accountId: string, profileId: unknown, pin: unknown): Promise<ProfileRow> {
  if (typeof profileId !== 'string') throw new ApiError(400, 'Profil fehlt.');
  const profile = await getProfile(accountId, profileId);
  if (!profile) throw new ApiError(404, 'Profil nicht gefunden.');
  const key = `pin:${profile.id}`;
  await throttle([key]);
  const ok = typeof pin === 'string' && /^\d{4}$/.test(pin) && (await verifySecret(pin, profile.pin_hash));
  if (!ok) {
    const r = await registerFailure(key, PIN_POLICY);
    throw new ApiError(
      401,
      r.retryAfter
        ? `Zu viele Fehlversuche. Profil für ${formatWait(r.retryAfter)} gesperrt.`
        : `Falscher PIN. Noch ${r.remaining} ${r.remaining === 1 ? 'Versuch' : 'Versuche'}.`,
      { retryAfter: r.retryAfter, remaining: r.remaining },
    );
  }
  await clearFailures(key);
  return profile;
}

export async function changePin(profile: ProfileRow, currentPin: unknown, newPin: unknown): Promise<void> {
  // re-verifies the current PIN through the same throttled path
  await unlockProfile(profile.account_id, profile.id, currentPin);
  const pin = validatePin(newPin);
  await db().update('profiles', { id: profile.id }, { pin_hash: await hashSecret(pin), pin_changed: true });
}

/** Changing the password invalidates every existing device session. */
export async function changePassword(account: AccountRow, current: unknown, next: unknown, ip: string): Promise<AccountRow> {
  await login(current, ip);
  const password = validatePassword(next);
  const patch = { password_hash: await hashSecret(password), session_version: account.session_version + 1 };
  await db().update('accounts', { id: account.id }, patch);
  return { ...account, ...patch };
}
