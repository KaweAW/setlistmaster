import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrap } from '../../data/bootstrap';
import { createDexieStore } from '../../data/dexie/dexieRepository';
import { RemoteError, SyncEngine, type BandSyncStatus } from '../engine';
import { FakeRemote } from './fakeRemote';

let n = 0;
/** Two devices must not share a clock: each gets its own, which tests move forward by hand. */
function device(remote: FakeRemote, start = 1_000_000) {
  const clock = { t: start };
  const store = createDexieStore({ dbName: `sync-${++n}`, now: () => clock.t });
  const statuses: BandSyncStatus[] = [];
  const applied = vi.fn();
  const engine = new SyncEngine(store.sync, remote, { onApplied: applied, onStatus: (_, s) => statuses.push(s) }, () => clock.t);
  return { store, engine, clock, statuses, applied };
}
const last = (d: { statuses: BandSyncStatus[] }) => d.statuses[d.statuses.length - 1]!;
const COUNT = 3 + 4 + 3 + 25 + 1 + 5 + 22; // performers, tunings, instruments, songs, setlist, blocks, items of the starting data

let remote: FakeRemote;
let a: ReturnType<typeof device>;
let b: ReturnType<typeof device>;
let bandId: string;

/** A shares its band; B joins it (a local copy of the band row, then a first sync). */
async function shareAndJoin() {
  const band = await bootstrap(a.store);
  bandId = band.id;
  await a.store.sync.linkBand(bandId, { upload: true });
  await a.engine.syncBand(bandId);
  await b.store.bands.put(band);
  await b.store.sync.linkBand(bandId);
  await b.engine.syncBand(bandId);
}
const song = async (d: typeof a, title: string) => (await d.store.songs.listBy('bandId', bandId)).find((s) => s.title === title)!;

beforeEach(() => {
  remote = new FakeRemote();
  a = device(remote);
  b = device(remote);
});

describe('sharing and joining', () => {
  it('uploads a whole band, and a new device gets all of it', async () => {
    await shareAndJoin();
    expect(remote.rows.size).toBe(COUNT);
    expect(await b.store.songs.listBy('bandId', bandId)).toHaveLength(25);
    expect(await b.store.items.listBy('bandId', bandId)).toHaveLength(22);
    expect(await b.store.blocks.listBy('bandId', bandId)).toHaveLength(5);
    expect(await b.store.setlists.listBy('bandId', bandId)).toHaveLength(1);
    expect(last(a)).toMatchObject({ state: 'idle', pending: 0 });
    expect(last(b)).toMatchObject({ state: 'idle', pending: 0 });
    expect(b.applied).toHaveBeenCalled();
  });

  it('does not send back what it just received', async () => {
    await shareAndJoin();
    expect(await b.store.sync.pendingCount(bandId)).toBe(0);
    const pushes = remote.pushes;
    await b.engine.syncBand(bandId);
    expect(remote.pushes).toBe(pushes);
  });

  it('keeps unsynced bands out of the queue', async () => {
    await bootstrap(a.store);
    const [any] = await a.store.songs.listAll();
    await a.store.songs.update(any!.id, { notes: 'local only' });
    expect(await a.store.sync.pendingCount(any!.bandId)).toBe(0);
  });
});

describe('editing on two devices', () => {
  beforeEach(shareAndJoin);

  it('shows an edit made on one device on the other', async () => {
    a.clock.t += 1000;
    await a.store.songs.update((await song(a, 'Creep')).id, { title: 'Creep (live)', key: 'G' });
    await a.engine.syncBand(bandId);
    await b.engine.syncBand(bandId);
    expect(await song(b, 'Creep (live)')).toMatchObject({ key: 'G' });
  });

  it('carries deletions, and new records, both ways', async () => {
    a.clock.t += 1000;
    const created = await a.store.songs.create({ bandId, title: 'New one', artist: 'X', capo: 0, tuningId: (await a.store.tunings.listBy('bandId', bandId))[0]!.id, defaultPerformerIds: [], instrumentIds: [], chordpro: '', notes: '', tags: [] });
    const gone = await song(a, 'Zombie');
    await a.store.songs.remove(gone.id);
    await a.engine.syncBand(bandId);
    await b.engine.syncBand(bandId);
    expect(await b.store.songs.get(created.id)).toMatchObject({ title: 'New one' });
    expect(await b.store.songs.get(gone.id)).toBeUndefined();
    expect(await b.store.songs.has(gone.id)).toBe(true);
  });

  it('settles a conflict in favour of the newest edit, on both devices', async () => {
    const id = (await song(a, 'Creep')).id;
    a.clock.t += 1000;
    b.clock.t += 5000; // B edits later
    await a.store.songs.update(id, { notes: 'from A' });
    await b.store.songs.update(id, { notes: 'from B' });
    await a.engine.syncBand(bandId); // A first
    await b.engine.syncBand(bandId);
    await a.engine.syncBand(bandId);
    expect((await a.store.songs.get(id))!.notes).toBe('from B');
    expect((await b.store.songs.get(id))!.notes).toBe('from B');
    expect(await a.store.sync.pendingCount(bandId)).toBe(0);
  });

  it('does not let an older edit overwrite a newer one that was already received', async () => {
    const id = (await song(a, 'Creep')).id;
    b.clock.t += 9000;
    await b.store.songs.update(id, { notes: 'newer' });
    await b.engine.syncBand(bandId);
    a.clock.t += 1000; // A edits "later" in real time, but with an older clock reading
    await a.store.songs.update(id, { notes: 'older' });
    await a.engine.syncBand(bandId);
    expect((await a.store.songs.get(id))!.notes).toBe('newer');
  });

  it('keeps an edit made while a send is in progress', async () => {
    const id = (await song(a, 'Creep')).id;
    a.clock.t += 1000;
    await a.store.songs.update(id, { notes: 'first' });
    remote.beforePush = async () => {
      remote.beforePush = null;
      a.clock.t += 1000;
      await a.store.songs.update(id, { notes: 'second' }); // edited again while the first version travels
    };
    await a.engine.syncBand(bandId);
    await b.engine.syncBand(bandId);
    expect((await b.store.songs.get(id))!.notes).toBe('second');
    expect(await a.store.sync.pendingCount(bandId)).toBe(0);
  });
});

describe('being offline, and being sent away', () => {
  beforeEach(shareAndJoin);

  it('keeps edits while offline and sends them when the connection is back', async () => {
    remote.failWith = new RemoteError('network', 'Failed to fetch');
    a.clock.t += 1000;
    await a.store.songs.update((await song(a, 'Creep')).id, { notes: 'written offline' });
    await a.engine.syncBand(bandId);
    expect(last(a)).toMatchObject({ state: 'offline', pending: 1 });

    remote.failWith = null;
    await a.engine.syncBand(bandId);
    expect(last(a)).toMatchObject({ state: 'idle', pending: 0 });
    await b.engine.syncBand(bandId);
    expect((await song(b, 'Creep')).notes).toBe('written offline');
  });

  it('reports that access was lost, instead of retrying forever', async () => {
    remote.failWith = new RemoteError('forbidden', 'not_a_member');
    await a.engine.syncBand(bandId);
    expect(last(a).state).toBe('revoked');
    remote.failWith = new RemoteError('other', 'boom');
    await a.engine.syncBand(bandId);
    expect(last(a)).toMatchObject({ state: 'error', message: 'boom' });
  });

  it('folds syncs requested during a sync into one more round', async () => {
    a.clock.t += 1000;
    await a.store.songs.update((await song(a, 'Creep')).id, { notes: 'x' });
    await Promise.all([a.engine.syncBand(bandId), a.engine.syncBand(bandId), a.engine.syncBand(bandId)]);
    expect(last(a)).toMatchObject({ state: 'idle', pending: 0 });
    expect(remote.pushes).toBeLessThanOrEqual(3);
  });
});

describe('live changes', () => {
  beforeEach(shareAndJoin);

  it('applies changes pushed by others without asking', async () => {
    b.engine.watch(bandId);
    a.clock.t += 1000;
    await a.store.songs.update((await song(a, 'Creep')).id, { notes: 'live!' });
    await a.engine.syncBand(bandId);
    await vi.waitFor(async () => expect((await song(b, 'Creep')).notes).toBe('live!'));
    b.engine.stop();
  });

  it('catches up after the connection comes back', async () => {
    b.engine.watch(bandId);
    a.clock.t += 1000;
    await a.store.songs.update((await song(a, 'Creep')).id, { notes: 'missed' });
    await a.engine.syncBand(bandId);
    remote.connected(bandId);
    await vi.waitFor(async () => expect((await song(b, 'Creep')).notes).toBe('missed'));
    b.engine.stop();
  });

  it('ignores damaged records and records of bands it does not sync', async () => {
    const [any] = await b.store.songs.listBy('bandId', bandId);
    const before = (await b.store.songs.get(any!.id))!.title;
    const n = await b.store.sync.applyRemote([
      { kind: 'song', id: any!.id, bandId, data: { ...any, title: '', updatedAt: 9e12 }, updatedAt: 9e12, deletedAt: null },
      { kind: 'song', id: any!.id, bandId: 'someone-else', data: { ...any, bandId: 'someone-else', title: 'X', updatedAt: 9e12 }, updatedAt: 9e12, deletedAt: null },
      { kind: 'song', id: any!.id, bandId, data: { ...any, bandId: 'other', title: 'Y', updatedAt: 9e12 }, updatedAt: 9e12, deletedAt: null },
    ]);
    expect(n).toBe(0);
    expect((await b.store.songs.get(any!.id))!.title).toBe(before);
  });

  it('forgets a band when it is unlinked', async () => {
    await b.store.sync.unlinkBand(bandId);
    b.clock.t += 1000;
    await b.store.songs.update((await song(b, 'Creep')).id, { notes: 'now local' });
    expect(await b.store.sync.pendingCount(bandId)).toBe(0);
    expect(await b.store.sync.linkedBands()).toEqual([]);
  });
});
