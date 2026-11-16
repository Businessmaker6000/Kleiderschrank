// Cookie sessions (httpOnly, signed). `wd_device` proves the PIN was entered on this
// device, `wd_profile` remembers which profile was chosen afterwards.
import { cookies, headers } from 'next/headers';
import { getAccount, getProfile } from './auth';
import type { AccountRow, ProfileRow } from './auth';
import { signToken, verifyToken } from './crypto';
import { ApiError } from './errors';

const DEVICE_COOKIE = 'wd_device';
const PROFILE_COOKIE = 'wd_profile';
const DEVICE_MAX_AGE = 60 * 60 * 12; // 12 hours, then the PIN is asked again
const PROFILE_MAX_AGE = 60 * 60 * 12;

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1',
    path: '/',
    maxAge,
  };
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || 'local';
}

export async function getDeviceAccount(): Promise<AccountRow | null> {
  const jar = await cookies();
  const token = await verifyToken<{ aid: string; v: number }>(jar.get(DEVICE_COOKIE)?.value);
  if (!token) return null;
  const account = await getAccount();
  if (!account || account.id !== token.aid || account.session_version !== token.v) return null;
  return account;
}

export async function getSession(): Promise<{ account: AccountRow; profile: ProfileRow } | null> {
  const account = await getDeviceAccount();
  if (!account) return null;
  const jar = await cookies();
  const token = await verifyToken<{ pid: string; aid: string }>(jar.get(PROFILE_COOKIE)?.value);
  if (!token || token.aid !== account.id) return null;
  const profile = await getProfile(account.id, token.pid);
  return profile ? { account, profile } : null;
}

export async function requireAccount(): Promise<AccountRow> {
  const account = await getDeviceAccount();
  if (!account) throw new ApiError(401, 'Bitte zuerst den PIN eingeben.', { reason: 'device' });
  return account;
}

export async function requireProfile(): Promise<{ account: AccountRow; profile: ProfileRow }> {
  const session = await getSession();
  if (!session) throw new ApiError(401, 'Bitte ein Profil wählen.', { reason: 'profile' });
  return session;
}

export async function setDeviceCookie(account: AccountRow) {
  const jar = await cookies();
  jar.set(DEVICE_COOKIE, await signToken({ aid: account.id, v: account.session_version }, DEVICE_MAX_AGE), cookieOptions(DEVICE_MAX_AGE));
}

export async function setProfileCookie(profile: ProfileRow) {
  const jar = await cookies();
  jar.set(PROFILE_COOKIE, await signToken({ pid: profile.id, aid: profile.account_id }, PROFILE_MAX_AGE), cookieOptions(PROFILE_MAX_AGE));
}

export async function clearProfileCookie() {
  (await cookies()).delete(PROFILE_COOKIE);
}

export async function clearAllCookies() {
  const jar = await cookies();
  jar.delete(PROFILE_COOKIE);
  jar.delete(DEVICE_COOKIE);
}
