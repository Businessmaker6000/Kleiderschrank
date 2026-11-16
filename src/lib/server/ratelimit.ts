// Persistent attempt counter with escalating lockouts. Stored in the database so it also
// holds across serverless instances and restarts.
import { db } from './db.ts';

export interface Policy {
  /** failures allowed inside the window before a lockout */
  max: number;
  windowMs: number;
  /** first lockout; doubles with every further lockout up to one hour */
  baseLockMs: number;
}

interface LimitRow {
  key: string;
  count: number;
  window_start: number;
  lockouts: number;
  locked_until: number;
}

export const PIN_POLICY: Policy = { max: 5, windowMs: 15 * 60_000, baseLockMs: 60_000 };
export const LOGIN_POLICY: Policy = { max: 8, windowMs: 15 * 60_000, baseLockMs: 5 * 60_000 };
export const GLOBAL_LOGIN_POLICY: Policy = { max: 40, windowMs: 15 * 60_000, baseLockMs: 10 * 60_000 };

async function read(key: string): Promise<LimitRow | null> {
  const rows = await db().select<LimitRow>('rate_limits', { key });
  return rows[0] || null;
}

/** Seconds until the key is usable again (0 = not locked). */
export async function lockedFor(key: string, now = Date.now()): Promise<number> {
  const row = await read(key);
  if (!row || Number(row.locked_until) <= now) return 0;
  return Math.ceil((Number(row.locked_until) - now) / 1000);
}

export async function registerFailure(
  key: string,
  policy: Policy,
  now = Date.now(),
): Promise<{ retryAfter: number; remaining: number }> {
  const row = await read(key);
  const fresh = !row || now - Number(row.window_start) > policy.windowMs;
  let count = (fresh ? 0 : row!.count) + 1;
  let lockouts = row?.lockouts || 0;
  let locked_until = Number(row?.locked_until || 0);
  if (count >= policy.max) {
    lockouts += 1;
    locked_until = now + Math.min(policy.baseLockMs * 2 ** (lockouts - 1), 60 * 60_000);
    count = 0;
  }
  const next = { count, window_start: fresh ? now : Number(row!.window_start), lockouts, locked_until };
  if (row) await db().update('rate_limits', { key }, next);
  else await db().insert('rate_limits', [{ key, ...next }]);
  return {
    retryAfter: locked_until > now ? Math.ceil((locked_until - now) / 1000) : 0,
    remaining: policy.max - count,
  };
}

export async function clearFailures(key: string): Promise<void> {
  await db().remove('rate_limits', { key });
}
