import { beforeEach, describe, expect, it } from 'vitest';
import { createDexieStore } from '../dexie/dexieRepository';
import { bootstrap } from '../bootstrap';
import { SEED_BLOCKS } from '../seed';
import { sortByPosition } from '../../core/ordering';

let n = 0;
let clock = 1_000;
const fresh = () => createDexieStore({ dbName: `test-${++n}`, now: () => ++clock });

describe('repository', () => {
  let store: ReturnType<typeof fresh>;
  beforeEach(() => {
    store = fresh();
  });

  it('writes and reads back a record', async () => {
    const band = await store.bands.create({ name: 'Test band' });
    expect(band.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await store.bands.get(band.id)).toEqual(band);
  });

  it('rejects invalid data', async () => {
    const band = await store.bands.create({ name: 'B' });
    await expect(
      store.performers.create({ bandId: band.id, name: 'X', color: 'red', symbol: '?' }),
    ).rejects.toThrow();
  });

  it('update refreshes updatedAt and keeps id and createdAt', async () => {
    const band = await store.bands.create({ name: 'Old' });
    const updated = await store.bands.update(band.id, { name: 'New' });
    expect(updated.name).toBe('New');
    expect(updated.id).toBe(band.id);
    expect(updated.createdAt).toBe(band.createdAt);
    expect(updated.updatedAt).toBeGreaterThan(band.updatedAt);
  });

  it('soft delete hides the record but keeps it stored', async () => {
    const band = await store.bands.create({ name: 'Gone' });
    await store.bands.remove(band.id);
    expect(await store.bands.get(band.id)).toBeUndefined();
    expect(await store.bands.listAll()).toHaveLength(0);
    const raw = await store.db.bands.get(band.id);
    expect(raw?.deletedAt).toBeTypeOf('number');
  });

  it('listBy filters on indexed fields', async () => {
    const a = await store.bands.create({ name: 'A' });
    const b = await store.bands.create({ name: 'B' });
    await store.tunings.create({ bandId: a.id, name: 'T', notes: '', isStandard: true });
    expect(await store.tunings.listBy('bandId', a.id)).toHaveLength(1);
    expect(await store.tunings.listBy('bandId', b.id)).toHaveLength(0);
  });
});

describe('bootstrap + seed', () => {
  it('creates the prototype setlist and is idempotent', async () => {
    const store = fresh();
    const band = await bootstrap(store);
    const again = await bootstrap(store);
    expect(again.id).toBe(band.id);

    const [setlist] = await store.setlists.listBy('bandId', band.id);
    expect(setlist?.title).toBe('Scaletta live');

    const blocks = sortByPosition(await store.blocks.listBy('setlistId', setlist!.id));
    expect(blocks.map((b) => b.name)).toEqual(SEED_BLOCKS.map((b) => b.name));
    expect(blocks[4]?.subtitle).toBe('chiusura emotiva e atmosferica');

    const items = await store.items.listBy('setlistId', setlist!.id);
    expect(items).toHaveLength(22);

    const songs = await store.songs.listBy('bandId', band.id);
    expect(songs.some((s) => s.title === 'Спокойная ночь' && s.artist === 'Кино')).toBe(true);

    const tunings = await store.tunings.listBy('bandId', band.id);
    expect(tunings.filter((t) => t.isStandard)).toHaveLength(1);
    expect(tunings).toHaveLength(4);
  });
});

describe('bootstrap concurrency', () => {
  it('creates a single band when called concurrently', async () => {
    const store = fresh();
    const [a, b] = await Promise.all([bootstrap(store), bootstrap(store)]);
    expect(a.id).toBe(b.id);
    expect(await store.bands.listAll()).toHaveLength(1);
    expect(await store.setlists.listAll()).toHaveLength(1);
  });
});

describe('files', () => {
  it('stores, reads and removes a binary attachment', async () => {
    const store = fresh();
    const data = new Uint8Array([37, 80, 68, 70]).buffer; // "%PDF"
    await store.files.put({ id: 'f1', bandId: 'b', name: 'chart.pdf', mimeType: 'application/pdf', size: 4, data, createdAt: 1 });
    const read = await store.files.get('f1');
    expect(read?.name).toBe('chart.pdf');
    expect(new Uint8Array(read!.data)).toEqual(new Uint8Array([37, 80, 68, 70]));
    await store.files.remove('f1');
    expect(await store.files.get('f1')).toBeUndefined();
  });
});

describe('put', () => {
  it('upserts a full record and can revive a soft-deleted one', async () => {
    const store = fresh();
    const band = await store.bands.create({ name: 'Back' });
    const before = (await store.bands.get(band.id))!;
    await store.bands.remove(band.id);
    expect(await store.bands.get(band.id)).toBeUndefined();
    await store.bands.put(before); // no deletedAt → alive again
    expect(await store.bands.get(band.id)).toEqual(before);
    await expect(store.bands.put({ ...before, name: '' })).rejects.toThrow();
  });
});
