// Setup diagnostics. Tells which piece of the configuration is missing or failing, without
// ever returning a secret. Once the app is set up and healthy it only answers { ok: true }.
import { db } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SESSION_SECRET', 'SETUP_CODE'] as const;
const TABLES = ['accounts', 'profiles', 'user_preferences', 'clothing_items', 'clothing_images', 'outfits', 'outfit_items', 'boards', 'board_outfits', 'custom_categories', 'rate_limits'];

const NIL = '00000000-0000-0000-0000-000000000000';

function describeUrl(value: string | undefined): string {
  if (!value) return 'fehlt';
  const v = value.trim();
  if (v !== value) return 'enthält Leerzeichen am Anfang oder Ende';
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(v)) return 'hat nicht die Form https://<projekt>.supabase.co';
  return 'ok';
}

function describeKey(value: string | undefined): string {
  if (!value) return 'fehlt';
  const v = value.trim();
  if (v !== value) return 'enthält Leerzeichen am Anfang oder Ende';
  if (v.startsWith('sb_publishable_')) return 'falscher Schlüssel: das ist der öffentliche (publishable) Schlüssel';
  if (v.startsWith('sb_secret_')) return 'ok (secret key)';
  if (v.startsWith('eyJ')) {
    try {
      const role = JSON.parse(Buffer.from(v.split('.')[1], 'base64url').toString()).role;
      return role === 'service_role' ? 'ok (service_role)' : `falscher Schlüssel: Rolle "${role}" statt "service_role"`;
    } catch {
      return 'sieht beschädigt aus (unvollständig kopiert?)';
    }
  }
  return 'unbekanntes Format';
}

export async function GET() {
  const env: Record<string, string> = {
    SUPABASE_URL: describeUrl(process.env.SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: describeKey(process.env.SUPABASE_SERVICE_ROLE_KEY),
    SESSION_SECRET: !process.env.SESSION_SECRET ? 'fehlt' : process.env.SESSION_SECRET.length < 32 ? 'zu kurz (mindestens 32 Zeichen)' : 'ok',
    SETUP_CODE: process.env.SETUP_CODE ? 'ok' : 'fehlt',
  };

  const database: Record<string, string> = {};
  let driver = 'unbekannt';
  let setUp = false;
  let healthy = REQUIRED.every((k) => env[k].startsWith('ok'));
  try {
    const store = db();
    driver = store.driver;
    for (const table of TABLES) {
      try {
        // accounts is read fully (one row at most); the others are only probed with a filter that matches nothing
        const column = table === 'rate_limits' ? 'key' : ['user_preferences', 'outfit_items', 'board_outfits'].includes(table) ? 'profile_id' : 'id';
        const rows = await store.select(table, table === 'accounts' ? {} : { [column]: table === 'rate_limits' ? 'healthcheck' : NIL });
        if (table === 'accounts') setUp = rows.length > 0;
        database[table] = 'ok';
      } catch (e) {
        healthy = false;
        database[table] = String((e as Error).message).slice(0, 200);
      }
    }
  } catch (e) {
    healthy = false;
    database.verbindung = String((e as Error).message).slice(0, 200);
  }

  let storage = 'nicht geprüft';
  if (driver === 'supabase') {
    try {
      // a missing object in an existing bucket is fine; a missing bucket is not
      await db().removeFiles(['healthcheck/does-not-exist']);
      storage = 'ok';
    } catch (e) {
      healthy = false;
      storage = String((e as Error).message).slice(0, 200);
    }
  }

  const headers = { 'Cache-Control': 'no-store' };
  if (healthy && setUp) return Response.json({ ok: true }, { headers });
  return Response.json({ ok: healthy, eingerichtet: setUp, treiber: driver, umgebungsvariablen: env, datenbank: database, speicher: storage }, { status: healthy ? 200 : 503, headers });
}
