// Persistence layer. Two interchangeable drivers behind one small interface:
//  - "supabase": Postgres + Storage, accessed only from the server with the service-role key
//  - "local":    JSON file + image files on disk (development / self-hosting on one machine)
// The browser never talks to the database directly; every query goes through the API routes,
// which scope each call to the unlocked profile.
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export type Row = Record<string, unknown>;
export type Match = Record<string, unknown>;

export interface Db {
  driver: 'supabase' | 'local';
  select<T = Row>(table: string, match?: Match): Promise<T[]>;
  insert(table: string, rows: Row[]): Promise<void>;
  update(table: string, match: Match, patch: Row): Promise<void>;
  remove(table: string, match: Match): Promise<void>;
  putFile(filePath: string, data: Buffer, contentType: string): Promise<void>;
  getFile(filePath: string): Promise<Buffer | null>;
  removeFiles(paths: string[]): Promise<void>;
}

export function dataDir(): string {
  return path.resolve(process.env.DATA_DIR || '.data');
}

function matches(row: Row, match: Match): boolean {
  for (const [k, v] of Object.entries(match)) {
    if (Array.isArray(v)) {
      if (!v.includes(row[k])) return false;
    } else if (row[k] !== v) return false;
  }
  return true;
}

function hasEmptyIn(match: Match): boolean {
  return Object.values(match).some((v) => Array.isArray(v) && v.length === 0);
}

class LocalDb implements Db {
  driver = 'local' as const;
  private tables: Record<string, Row[]> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private dir: string;
  constructor(dir: string) {
    this.dir = dir;
  }
  private get file() {
    return path.join(this.dir, 'db.json');
  }
  private async load(): Promise<Record<string, Row[]>> {
    if (!this.tables) {
      try {
        this.tables = JSON.parse(await fs.readFile(this.file, 'utf8'));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        this.tables = {};
      }
    }
    return this.tables!;
  }
  private persist(): Promise<void> {
    const run = async () => {
      await fs.mkdir(this.dir, { recursive: true });
      const tmp = this.file + '.tmp';
      await fs.writeFile(tmp, JSON.stringify(this.tables));
      await fs.rename(tmp, this.file);
    };
    this.queue = this.queue.then(run, run);
    return this.queue;
  }
  async select<T = Row>(table: string, match: Match = {}): Promise<T[]> {
    const t = await this.load();
    return structuredClone((t[table] || []).filter((r) => matches(r, match))) as T[];
  }
  async insert(table: string, rows: Row[]) {
    const t = await this.load();
    (t[table] ||= []).push(...structuredClone(rows));
    await this.persist();
  }
  async update(table: string, match: Match, patch: Row) {
    const t = await this.load();
    for (const r of t[table] || []) if (matches(r, match)) Object.assign(r, structuredClone(patch));
    await this.persist();
  }
  async remove(table: string, match: Match) {
    const t = await this.load();
    t[table] = (t[table] || []).filter((r) => !matches(r, match));
    await this.persist();
  }
  private filePath(p: string) {
    const root = path.resolve(this.dir, 'uploads');
    const full = path.resolve(root, p);
    if (!full.startsWith(root + path.sep)) throw new Error('invalid path');
    return full;
  }
  async putFile(p: string, data: Buffer) {
    const full = this.filePath(p);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }
  async getFile(p: string) {
    try {
      return await fs.readFile(this.filePath(p));
    } catch {
      return null;
    }
  }
  async removeFiles(paths: string[]) {
    await Promise.all(paths.map((p) => fs.rm(this.filePath(p), { force: true })));
  }
}

const BUCKET = 'wardrobe';

class SupabaseDb implements Db {
  driver = 'supabase' as const;
  private c: SupabaseClient;
  constructor(url: string, key: string) {
    this.c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private filter(q: any, match: Match) {
    for (const [k, v] of Object.entries(match)) q = Array.isArray(v) ? q.in(k, v) : q.eq(k, v);
    return q;
  }
  async select<T = Row>(table: string, match: Match = {}): Promise<T[]> {
    if (hasEmptyIn(match)) return [];
    const { data, error } = await this.filter(this.c.from(table).select('*'), match).limit(10000);
    if (error) throw new Error(`db select ${table}: ${error.message}`);
    return data as T[];
  }
  async insert(table: string, rows: Row[]) {
    if (!rows.length) return;
    const { error } = await this.c.from(table).insert(rows);
    if (error) throw new Error(`db insert ${table}: ${error.message}`);
  }
  async update(table: string, match: Match, patch: Row) {
    if (hasEmptyIn(match)) return;
    const { error } = await this.filter(this.c.from(table).update(patch), match);
    if (error) throw new Error(`db update ${table}: ${error.message}`);
  }
  async remove(table: string, match: Match) {
    if (hasEmptyIn(match)) return;
    if (!Object.keys(match).length) throw new Error('refusing unfiltered delete');
    const { error } = await this.filter(this.c.from(table).delete(), match);
    if (error) throw new Error(`db delete ${table}: ${error.message}`);
  }
  async putFile(p: string, data: Buffer, contentType: string) {
    const { error } = await this.c.storage.from(BUCKET).upload(p, data, { contentType, upsert: true });
    if (error) throw new Error(`storage upload: ${error.message}`);
  }
  async getFile(p: string) {
    const { data, error } = await this.c.storage.from(BUCKET).download(p);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }
  async removeFiles(paths: string[]) {
    if (!paths.length) return;
    const { error } = await this.c.storage.from(BUCKET).remove(paths);
    if (error) throw new Error(`storage remove: ${error.message}`);
  }
}

/**
 * Forgiving reading of SUPABASE_URL. Accepts the plain project URL, the same with a path
 * (e.g. .../rest/v1/), a dashboard link, or a bare project ref — and falls back to the
 * project ref stored inside the API key. Always returns https://<ref>.supabase.co.
 */
export function resolveSupabaseUrl(raw: string | undefined, key?: string): string | undefined {
  const value = (raw || '').trim();
  const origin = (ref: string) => `https://${ref.toLowerCase()}.supabase.co`;
  const fromHost = value.match(/([a-z0-9]{15,30})\.supabase\.co/i);
  if (fromHost) return origin(fromHost[1]);
  const fromDashboard = value.match(/supabase\.com\/dashboard\/project\/([a-z0-9]{15,30})/i);
  if (fromDashboard) return origin(fromDashboard[1]);
  if (/^[a-z0-9]{15,30}$/i.test(value)) return origin(value);
  // legacy keys are JWTs that carry the project ref
  if (key && key.startsWith('eyJ')) {
    try {
      const ref = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).ref;
      if (typeof ref === 'string' && /^[a-z0-9]{15,30}$/.test(ref)) return origin(ref);
    } catch {}
  }
  return value || undefined;
}

/** True when SUPABASE_SERVICE_ROLE_KEY holds the public (anon / publishable) key, which cannot write. */
export function hasPublicKeyInsteadOfSecret(): boolean {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  if (key.startsWith('sb_publishable_')) return true;
  if (!key.startsWith('eyJ')) return false;
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role !== 'service_role';
  } catch {
    return false;
  }
}

const g = globalThis as unknown as { __wardrobeDb?: Db };

export function db(): Db {
  if (g.__wardrobeDb) return g.__wardrobeDb;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const url = resolveSupabaseUrl(process.env.SUPABASE_URL, key);
  if (url && key) {
    g.__wardrobeDb = new SupabaseDb(url, key);
  } else {
    if (process.env.VERCEL) {
      throw new Error('SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein (kein dauerhaftes Dateisystem auf Vercel).');
    }
    g.__wardrobeDb = new LocalDb(dataDir());
  }
  return g.__wardrobeDb;
}

/** Tests only. */
export function resetDbForTests() {
  delete g.__wardrobeDb;
}
