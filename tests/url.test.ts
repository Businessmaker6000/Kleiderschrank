import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveSupabaseUrl } from '../src/lib/server/db.ts';

const REF = 'abcdefghijklmnopqrst';
const want = `https://${REF}.supabase.co`;
const jwt = (payload: object) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;

test('SUPABASE_URL is read forgivingly', () => {
  assert.equal(resolveSupabaseUrl(want), want);
  assert.equal(resolveSupabaseUrl(` ${want}/ \n`), want);
  assert.equal(resolveSupabaseUrl(`${want}/rest/v1/`), want);
  assert.equal(resolveSupabaseUrl(`https://supabase.com/dashboard/project/${REF}/settings/api`), want);
  assert.equal(resolveSupabaseUrl(REF), want);
  assert.equal(resolveSupabaseUrl(`${REF}.supabase.co`), want);
});

test('falls back to the project ref inside a legacy key', () => {
  assert.equal(resolveSupabaseUrl('irgendwas', jwt({ ref: REF, role: 'service_role' })), want);
  assert.equal(resolveSupabaseUrl(undefined, jwt({ ref: REF })), want);
  assert.equal(resolveSupabaseUrl('', 'sb_secret_xyz'), undefined);
});
