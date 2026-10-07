import { beforeEach, describe, expect, it } from 'vitest';
import { createLocalBand } from '../bands';
import { bootstrap } from '../bootstrap';
import { copySetlistToBand, copySongsToBand } from '../copySetlist';
import { createDexieStore } from '../dexie/dexieRepository';
import { loadTree } from '../setlistService';

let n = 0;
let clock = 1_000;
const fresh = () => createDexieStore({ dbName: `copy-${++n}`, now: () => ++clock });

describe('copySetlistToBand', () => {
  let store: ReturnType<typeof fresh>;
  let from: string;
  let setlistId: string;

  beforeEach(async () => {
    store = fresh();
    from = (await bootstrap(store)).id;
    setlistId = (await store.setlists.listBy('bandId', from))[0]!.id;
  });

  it('copies a setlist into an empty band, creating its songs, singers and tunings', async () => {
    const to = (await createLocalBand(store, 'Other', 'en')).id;
    const tree = (await loadTree(store, setlistId))!;
    const id = await copySetlistToBand(store, setlistId, to);
    const copy = (await loadTree(store, id!))!;
    expect(copy.setlist.bandId).toBe(to);
    expect(copy.blocks).toHaveLength(tree.blocks.length);
    expect(copy.items).toHaveLength(tree.items.length);
    const songs = await store.songs.listBy('bandId', to);
    for (const item of copy.items) {
      expect(item.bandId).toBe(to);
      expect(songs.some((s) => s.id === item.songId)).toBe(true);
      for (const p of item.performerIds) expect((await store.performers.get(p))?.bandId).toBe(to);
    }
    for (const s of songs) expect((await store.tunings.get(s.tuningId))?.bandId).toBe(to);
    // the source is untouched
    expect((await loadTree(store, setlistId))!.items).toHaveLength(tree.items.length);
  });

  it('reuses what the target already has instead of duplicating it', async () => {
    const to = (await createLocalBand(store, 'Other', 'en')).id;
    await copySetlistToBand(store, setlistId, to);
    const songs = (await store.songs.listBy('bandId', to)).length;
    const performers = (await store.performers.listBy('bandId', to)).length;
    await copySetlistToBand(store, setlistId, to);
    expect(await store.songs.listBy('bandId', to)).toHaveLength(songs);
    expect(await store.performers.listBy('bandId', to)).toHaveLength(performers);
    expect(await store.setlists.listBy('bandId', to)).toHaveLength(2);
  });

  it('returns undefined for a missing setlist', async () => {
    expect(await copySetlistToBand(store, 'nope', from)).toBeUndefined();
  });
});

describe('copySongsToBand', () => {
  it('copies single songs once and leaves the ones the target has', async () => {
    const store = createDexieStore({ dbName: `copy-songs-${++n}`, now: () => ++clock });
    const from = (await bootstrap(store)).id;
    const to = (await createLocalBand(store, 'Other', 'en')).id;
    const creep = (await store.songs.listBy('bandId', from)).find((s) => s.title === 'Creep')!;
    await store.songs.update(creep.id, { chordpro: '[Am]hello' });
    const first = await copySongsToBand(store, [creep.id], to);
    expect(first).toEqual({ copied: 1, existing: 0 });
    const copy = (await store.songs.listBy('bandId', to)).find((s) => s.title === 'Creep')!;
    expect(copy.chordpro).toBe('[Am]hello');
    expect(copy.id).not.toBe(creep.id);
    expect((await store.tunings.get(copy.tuningId))?.bandId).toBe(to);
    expect(await copySongsToBand(store, [creep.id], to)).toEqual({ copied: 0, existing: 1 });
    expect((await store.songs.listBy('bandId', to)).filter((s) => s.title === 'Creep')).toHaveLength(1);
  });
});
