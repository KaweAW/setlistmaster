import { describe, expect, it } from 'vitest';
import { bootstrap } from '../bootstrap';
import { createDexieStore } from '../dexie/dexieRepository';
import { LIBRARY_ADDITIONS, libraryId } from '../librarySongs';

let n = 0;
const fresh = () => createDexieStore({ dbName: `lib-${++n}` });
const titles = async (store: ReturnType<typeof fresh>, bandId: string) =>
  (await store.songs.listBy('bandId', bandId)).map((s) => `${s.title} | ${s.artist}`);

describe('library additions', () => {
  it('puts the new songs in the library, not in the setlist, in standard tuning', async () => {
    const store = fresh();
    const band = await bootstrap(store);
    const all = await titles(store, band.id);
    for (const s of LIBRARY_ADDITIONS) expect(all).toContain(`${s.title} | ${s.artist}`);
    expect(await store.songs.listBy('bandId', band.id)).toHaveLength(25);
    expect(await store.items.listAll()).toHaveLength(22);
    const zombie = (await store.songs.listBy('bandId', band.id)).find((s) => s.title === 'Zombie')!;
    expect((await store.tunings.get(zombie.tuningId))?.isStandard).toBe(true);
    expect(await store.items.listBy('songId', zombie.id)).toHaveLength(0);
  });

  it('never duplicates "There, There", which was already there', async () => {
    const store = fresh();
    const band = await bootstrap(store);
    expect((await titles(store, band.id)).filter((t) => t.startsWith('There, There'))).toHaveLength(1);
  });

  it('reaches an existing install that was created before these songs, once', async () => {
    const store = fresh();
    const band = await bootstrap(store);
    for (const s of LIBRARY_ADDITIONS) await store.db.songs.delete(await libraryId(band.id, s.key)); // as if they had never existed
    expect(await store.songs.listBy('bandId', band.id)).toHaveLength(22);
    await bootstrap(store);
    await bootstrap(store);
    expect(await store.songs.listBy('bandId', band.id)).toHaveLength(25);
  });

  it('does not bring back a song the user deleted', async () => {
    const store = fresh();
    const band = await bootstrap(store);
    const zombieId = await libraryId(band.id, LIBRARY_ADDITIONS[1].key);
    await store.songs.remove(zombieId);
    await bootstrap(store);
    expect(await store.songs.has(zombieId)).toBe(true); // still stored, but deleted
    expect(await store.songs.get(zombieId)).toBeUndefined();
    expect(await store.songs.listBy('bandId', band.id)).toHaveLength(24);
  });

  it('gives the same ids on every device of a band, and different ones in different bands', async () => {
    expect(await libraryId('band-1', 'k')).toBe(await libraryId('band-1', 'k'));
    expect(await libraryId('band-1', 'k')).not.toBe(await libraryId('band-2', 'k'));
    expect(await libraryId('band-1', 'k')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
