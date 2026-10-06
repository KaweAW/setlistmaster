import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

// Every migration, in order: the database under test is the one a real project ends up with.
const migrations = ['0001_cloud.sql', '0002_instruments.sql', '0003_pdf_storage.sql'].map((f) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));

export interface User {
  id: string;
  email: string;
}

/** A real Postgres (WASM) with the bits of Supabase the migration relies on: roles, auth.uid(), auth.jwt(), Realtime publication. */
export async function newDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant usage on schema auth to authenticated;
    grant usage on schema public to anon, authenticated;
    create publication supabase_realtime;
    -- The part of Supabase Storage the policies rely on: buckets, and objects with row level security.
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;
  `);
  for (const migration of migrations) await db.exec(migration);
  return db;
}

let counter = 0;
export async function newUser(db: PGlite, name: string): Promise<User> {
  const id = (await db.query<{ u: string }>('select gen_random_uuid()::text as u')).rows[0]!.u;
  const email = `${name}${++counter}@example.com`;
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
  return { id, email };
}

/** Runs one statement as a signed-in user (or as nobody), the way PostgREST does for the app. */
export async function as<T = Record<string, unknown>>(db: PGlite, user: User | null, sql: string, params: unknown[] = []) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)", [
    user?.id ?? '',
    JSON.stringify(user ? { sub: user.id, email: user.email } : {}),
  ]);
  await db.exec(user ? 'set role authenticated' : 'set role anon');
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

export const uuid = async (db: PGlite) => (await db.query<{ u: string }>('select gen_random_uuid()::text as u')).rows[0]!.u;
