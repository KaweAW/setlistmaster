import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { as, newDb, newUser, uuid, type User } from './harness';

let db: PGlite;
let alice: User; // the creator
let bob: User;
let carol: User;
let bandId: string;

const rows = <T = Record<string, unknown>>(user: User | null, sql: string, params: unknown[] = []) => as<T>(db, user, sql, params);
const rec = (kind: string, id: string, updatedAt: number, extra: Record<string, unknown> = {}, deletedAt: number | null = null) =>
  ({ kind, id, updated_at: updatedAt, deleted_at: deletedAt, data: { id, bandId, updatedAt, ...extra } });
const upsert = (user: User, records: unknown[], band = bandId) =>
  rows<{ upsert_records: number }>(user, 'select public.upsert_records($1, $2::jsonb)', [band, JSON.stringify(records)]).then((r) => r[0]!.upsert_records);
const invite = async (role: string, email: string | null = null, user = alice) =>
  (await rows<{ create_invitation: string }>(user, 'select public.create_invitation($1, $2, $3)', [bandId, role, email]))[0]!.create_invitation;
const accept = (user: User, token: string) => rows(user, 'select public.accept_invitation($1) as band', [token]);
const join = async (user: User, role: string) => accept(user, await invite(role));
const roleOf = async (user: User) => (await rows<{ r: string | null }>(user, 'select public.member_role($1) as r', [bandId]))[0]!.r;

// One database for the whole file (starting Postgres is the slow part); every test makes its own users and band.
beforeAll(async () => {
  db = await newDb();
}, 60_000);

beforeEach(async () => {
  [alice, bob, carol] = [await newUser(db, 'alice'), await newUser(db, 'bob'), await newUser(db, 'carol')];
  bandId = await uuid(db);
  await rows(alice, 'select public.create_band($1, $2)', [bandId, 'The Band']);
});

describe('bands', () => {
  it('makes the founder the creator, and only the creator', async () => {
    expect(await roleOf(alice)).toBe('creator');
    const members = await rows(alice, 'select email, role from public.members where band_id = $1', [bandId]);
    expect(members).toEqual([{ email: alice.email, role: 'creator' }]);
  });
  it('refuses a band id that already exists, and anonymous callers', async () => {
    await expect(rows(bob, 'select public.create_band($1, $2)', [bandId, 'Mine'])).rejects.toThrow();
    await expect(rows(null, 'select public.create_band($1, $2)', [await uuid(db), 'X'])).rejects.toThrow();
  });
  it('keeps outsiders out of everything', async () => {
    await upsert(alice, [rec('song', await uuid(db), 1, { title: 'Zombie' })]);
    for (const table of ['bands', 'members', 'records', 'invitations']) {
      expect(await rows(bob, `select 1 from public.${table}`)).toEqual([]);
    }
    await expect(upsert(bob, [rec('song', await uuid(db), 2)])).rejects.toThrow(/not_a_member/);
  });
  it('allows no direct writes to the tables, even for the creator', async () => {
    const id = await uuid(db);
    await expect(rows(alice, "insert into public.records (band_id, kind, id, data, updated_at) values ($1, 'song', $2, '{}', 1)", [bandId, id])).rejects.toThrow();
    await expect(rows(alice, "update public.members set role = 'editor' where band_id = $1", [bandId])).rejects.toThrow();
    await expect(rows(alice, 'delete from public.bands where id = $1', [bandId])).rejects.toThrow();
    await expect(rows(alice, "insert into public.invitations (band_id, role, created_by) values ($1, 'editor', $2)", [bandId, alice.id])).rejects.toThrow();
  });
  it('keeps two bands apart', async () => {
    const otherBand = await uuid(db);
    await rows(bob, 'select public.create_band($1, $2)', [otherBand, 'Other']);
    await upsert(alice, [rec('song', await uuid(db), 1)]);
    expect(await rows(bob, 'select 1 from public.records')).toEqual([]);
    expect(await rows(alice, 'select 1 from public.bands')).toHaveLength(1);
  });
});

describe('invitations', () => {
  it('lets someone join with a link, once', async () => {
    const token = await invite('editor');
    await accept(bob, token);
    expect(await roleOf(bob)).toBe('editor');
    expect((await accept(bob, token))[0]).toEqual({ band: bandId }); // joining twice is harmless
    await expect(accept(carol, token)).rejects.toThrow(/invitation_used/);
    expect(await roleOf(carol)).toBeNull();
  });
  it('gives the role that was chosen', async () => {
    await join(bob, 'viewer');
    await join(carol, 'editor');
    expect(await roleOf(bob)).toBe('viewer');
    expect(await roleOf(carol)).toBe('editor');
    await expect(invite('creator')).rejects.toThrow(/invalid_role/); // nobody can be made a second creator
  });
  it('binds an invitation by email to that address only', async () => {
    const token = await invite('viewer', ` ${bob.email.toUpperCase()} `);
    await expect(accept(carol, token)).rejects.toThrow(/invitation_wrong_email/);
    await accept(bob, token);
    expect(await roleOf(bob)).toBe('viewer');
  });
  it('can be revoked, and expires', async () => {
    const revoked = await invite('editor');
    const id = (await rows<{ id: string }>(alice, 'select id from public.invitations where token = $1', [revoked]))[0]!.id;
    await rows(alice, 'select public.revoke_invitation($1)', [id]);
    await expect(accept(bob, revoked)).rejects.toThrow(/invitation_revoked/);

    const old = await invite('editor');
    await db.query("update public.invitations set expires_at = now() - interval '1 minute' where token = $1", [old]);
    await expect(accept(bob, old)).rejects.toThrow(/invitation_expired/);
    await expect(accept(bob, 'nonsense')).rejects.toThrow(/invitation_not_found/);
  });
  it('can only be created, listed and revoked by the creator', async () => {
    await join(bob, 'editor');
    await join(carol, 'viewer');
    for (const member of [bob, carol]) {
      await expect(invite('viewer', null, member)).rejects.toThrow(/creator_only/);
      expect(await rows(member, 'select 1 from public.invitations')).toEqual([]);
    }
    const token = await invite('viewer');
    const id = (await rows<{ id: string }>(alice, 'select id from public.invitations where token = $1', [token]))[0]!.id;
    await expect(rows(bob, 'select public.revoke_invitation($1)', [id])).rejects.toThrow(/creator_only/);
  });
  it('shows what a link points to before accepting', async () => {
    const ok = await invite('editor', bob.email);
    const preview = (token: string) => rows(carol, 'select * from public.invitation_preview($1)', [token]);
    expect(await preview(ok)).toEqual([{ band_name: 'The Band', role: 'editor', email_bound: true, status: 'ok' }]);
    expect((await preview('nope'))[0]).toMatchObject({ status: 'not_found' });
    await accept(bob, ok);
    expect((await preview(ok))[0]).toMatchObject({ status: 'used' });
  });
});

describe('roles and data', () => {
  it('lets creator and editors write, and viewers only read', async () => {
    await join(bob, 'editor');
    await join(carol, 'viewer');
    const song = await uuid(db);
    expect(await upsert(alice, [rec('song', song, 10, { title: 'A' })])).toBe(1);
    expect(await upsert(bob, [rec('song', song, 20, { title: 'B' })])).toBe(1);
    await expect(upsert(carol, [rec('song', song, 30, { title: 'C' })])).rejects.toThrow(/read_only/);
    const seen = await rows<{ data: { title: string } }>(carol, 'select data from public.records');
    expect(seen.map((r) => r.data.title)).toEqual(['B']);
  });
  it('keeps the newest write of each record (last write wins)', async () => {
    const id = await uuid(db);
    expect(await upsert(alice, [rec('setlist', id, 100, { title: 'first' })])).toBe(1);
    expect(await upsert(alice, [rec('setlist', id, 50, { title: 'older' })])).toBe(0);
    expect(await upsert(alice, [rec('setlist', id, 100, { title: 'same time' })])).toBe(0);
    expect(await upsert(alice, [rec('setlist', id, 200, { title: 'newer' })])).toBe(1);
    const [row] = await rows<{ data: { title: string }; updated_at: string }>(alice, 'select data, updated_at from public.records');
    expect(row!.data.title).toBe('newer');
  });
  it('carries deletions, as soft deletes', async () => {
    const id = await uuid(db);
    await upsert(alice, [rec('song', id, 1)]);
    await upsert(alice, [rec('song', id, 2, {}, 2)]);
    const [row] = await rows<{ deleted_at: string }>(alice, 'select deleted_at from public.records');
    expect(Number(row!.deleted_at)).toBe(2);
  });
  it('numbers every applied write, so devices can ask only for what is new', async () => {
    const [a, b] = [await uuid(db), await uuid(db)];
    await upsert(alice, [rec('song', a, 1)]);
    const first = Number((await rows<{ m: string }>(alice, 'select max(seq) as m from public.records'))[0]!.m);
    await upsert(alice, [rec('song', a, 0)]); // ignored: nothing changes
    expect(Number((await rows<{ m: string }>(alice, 'select max(seq) as m from public.records'))[0]!.m)).toBe(first);
    await upsert(alice, [rec('song', b, 1), rec('song', a, 5)]);
    const fresh = await rows<{ id: string }>(alice, 'select id from public.records where band_id = $1 and seq > $2 order by seq', [bandId, first]);
    expect(fresh.map((r) => r.id).sort()).toEqual([a, b].sort());
  });
  it('refuses records that claim another band', async () => {
    const wrong = { ...rec('song', await uuid(db), 1), data: { bandId: await uuid(db) } };
    await expect(upsert(alice, [wrong])).rejects.toThrow(/band_mismatch/);
  });
});

describe('what only the creator can do', () => {
  it('changes roles and removes people, and nobody else can', async () => {
    await join(bob, 'editor');
    await join(carol, 'editor');
    await expect(rows(bob, 'select public.set_member_role($1, $2, $3)', [bandId, carol.id, 'viewer'])).rejects.toThrow(/creator_only/);
    await expect(rows(bob, 'select public.remove_member($1, $2)', [bandId, carol.id])).rejects.toThrow(/creator_only/);

    await rows(alice, 'select public.set_member_role($1, $2, $3)', [bandId, bob.id, 'viewer']);
    expect(await roleOf(bob)).toBe('viewer');
    await expect(upsert(bob, [rec('song', await uuid(db), 1)])).rejects.toThrow(/read_only/); // demoted: cannot write any more

    await rows(alice, 'select public.remove_member($1, $2)', [bandId, bob.id]);
    expect(await roleOf(bob)).toBeNull();
    expect(await rows(bob, 'select 1 from public.records')).toEqual([]); // removed: cannot read any more
  });
  it('cannot be removed or demoted itself, and cannot leave', async () => {
    await expect(rows(alice, 'select public.remove_member($1, $2)', [bandId, alice.id])).rejects.toThrow(/member_not_found/);
    await expect(rows(alice, 'select public.set_member_role($1, $2, $3)', [bandId, alice.id, 'viewer'])).rejects.toThrow(/member_not_found/);
    await expect(rows(alice, 'select public.leave_band($1)', [bandId])).rejects.toThrow(/creator_cannot_leave/);
    expect(await roleOf(alice)).toBe('creator');
  });
  it('lets anyone else leave on their own', async () => {
    await join(bob, 'editor');
    await rows(bob, 'select public.leave_band($1)', [bandId]);
    expect(await roleOf(bob)).toBeNull();
    expect(await rows(alice, 'select 1 from public.members')).toHaveLength(1);
  });
});

describe('instruments', () => {
  it('syncs instruments and parts like any other record', async () => {
    const instrument = await uuid(db);
    const part = await uuid(db);
    expect(await upsert(alice, [rec('instrument', instrument, 1, { name: 'Bass' }), rec('part', part, 1, { instrumentId: instrument })])).toBe(2);
    expect((await rows(alice, "select kind from public.records where kind in ('instrument', 'part') order by kind")).map((r) => r.kind)).toEqual(['instrument', 'part']);
  });
  it('remembers which instrument each member plays, for that member only', async () => {
    await join(bob, 'viewer');
    const bass = await uuid(db);
    const piano = await uuid(db);
    expect((await rows<{ i: string | null }>(bob, 'select public.my_instrument($1) as i', [bandId]))[0]!.i).toBeNull();
    await rows(bob, 'select public.set_my_instrument($1, $2)', [bandId, bass]); // viewers may: it is their own preference
    await rows(alice, 'select public.set_my_instrument($1, $2)', [bandId, piano]);
    expect((await rows<{ i: string }>(bob, 'select public.my_instrument($1) as i', [bandId]))[0]!.i).toBe(bass);
    expect((await rows<{ i: string }>(alice, 'select public.my_instrument($1) as i', [bandId]))[0]!.i).toBe(piano);
    await rows(bob, 'select public.set_my_instrument($1, null)', [bandId]);
    expect((await rows<{ i: string | null }>(bob, 'select public.my_instrument($1) as i', [bandId]))[0]!.i).toBeNull();
  });
  it('refuses people who are not in the band', async () => {
    await expect(rows(carol, 'select public.set_my_instrument($1, $2)', [bandId, await uuid(db)])).rejects.toThrow();
    expect((await rows<{ i: string | null }>(carol, 'select public.my_instrument($1) as i', [bandId]))[0]!.i).toBeNull();
  });
});
