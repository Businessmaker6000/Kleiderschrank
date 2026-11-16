import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { SignJWT, jwtVerify } from 'jose';
import { dataDir } from './db.ts';

const N = 16384;
const KEYLEN = 32;

function scrypt(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(secret, salt, KEYLEN, { N }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** Salted scrypt hash, stored as `scrypt$<salt>$<hash>` (base64). */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(secret, salt);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const key = await scrypt(secret, Buffer.from(saltB64, 'base64'));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

let cachedKey: Uint8Array | null = null;

async function sessionKey(): Promise<Uint8Array> {
  if (cachedKey) return cachedKey;
  let secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.SUPABASE_URL || process.env.VERCEL) {
      throw new Error('SESSION_SECRET muss gesetzt sein (mindestens 32 Zeichen).');
    }
    // local driver: generate once and keep next to the data
    const file = path.join(dataDir(), 'session-secret');
    try {
      secret = (await fs.readFile(file, 'utf8')).trim();
    } catch {
      secret = randomBytes(48).toString('base64');
      await fs.mkdir(dataDir(), { recursive: true });
      await fs.writeFile(file, secret, { mode: 0o600 });
    }
  }
  if (secret.length < 32) throw new Error('SESSION_SECRET muss mindestens 32 Zeichen lang sein.');
  cachedKey = new TextEncoder().encode(secret);
  return cachedKey;
}

export async function signToken(payload: Record<string, unknown>, maxAgeSeconds: number): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + maxAgeSeconds)
    .sign(await sessionKey());
}

export async function verifyToken<T = Record<string, unknown>>(token: string | undefined): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await sessionKey(), { algorithms: ['HS256'] });
    return payload as T;
  } catch {
    return null;
  }
}
