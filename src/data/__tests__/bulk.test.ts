import { describe, expect, it } from 'vitest';
import { createBackup, parseBackup } from '../../core/backup';
import { bootstrap } from '../bootstrap';
import { createDexieStore } from '../dexie/dexieRepository';

let n = 0;
const fresh = () => createDexieStore({ dbName: `bulk-${++n}` });

async function seeded() {
  const store = fresh();
  const band = await bootstrap(store);
  return { store, band };
}

describe('bulk store', () => {
  it('reads every live record and the PDFs, leaving out deleted ones', async () => {
    const { store, band } = await seeded();
    const songs = await store.songs.listBy('bandId', band.id);
    const first = songs.find((s) => s.title === 'Creep')!;
    const second = songs.find((s) => s.title === 'Karma Police')!; // both are in the setlist
    await store.files.put({ id: 'f1', bandId: band.id, name: 'a.pdf', mimeType: 'application/pdf', size: 3, createdAt: 1, data: new Uint8Array([1, 2, 3]).buffer });
    await store.songs.update(first!.id, { pdfBlobId: 'f1' });
    // a deleted song with no setlist entry must not travel in the backup
    await store.items.remove((await store.items.listBy('songId', second!.id))[0]!.id);
    await store.songs.remove(second!.id);

    const snapshot = await store.bulk.readAll();
    expect(snapshot.songs).toHaveLength(24);
    expect(snapshot.items).toHaveLength(21);
    expect(snapshot.blocks).toHaveLength(5);
    expect(snapshot.setlists).toHaveLength(1);
    expect(snapshot.performers).toHaveLength(3);
    expect(snapshot.tunings).toHaveLength(4);
    expect(snapshot.files.map((f) => f.name)).toEqual(['a.pdf']);
  });

  it('backs up to a file and restores into a different, empty device', async () => {
    const { store, band } = await seeded();
    const song = (await store.songs.listBy('bandId', band.id)).find((s) => s.title === 'Спокойная ночь')!;
    await store.files.put({ id: 'f1', bandId: band.id, name: 'chart.pdf', mimeType: 'application/pdf', size: 4, createdAt: 1, data: new Uint8Array([37, 80, 68, 70]).buffer });
    await store.songs.update(song.id, { chordpro: '[Am]Спокойная [G]ночь', pdfBlobId: 'f1', key: 'Am' });

    const text = JSON.stringify(createBackup(await store.bulk.readAll(), Date.now()));
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const other = fresh(); // a brand-new device
    await other.bulk.replaceAll(parsed.snapshot);

    const restored = await other.songs.get(song.id);
    expect(restored).toMatchObject({ title: 'Спокойная ночь', chordpro: '[Am]Спокойная [G]ночь', key: 'Am', pdfBlobId: 'f1' });
    expect(new Uint8Array((await other.files.get('f1'))!.data)).toEqual(new Uint8Array([37, 80, 68, 70]));
    expect(await other.items.listAll()).toHaveLength(22);
    expect((await other.bands.listAll())[0]!.id).toBe(band.id);
    // and the restored device is not seeded a second time
    await bootstrap(other);
    expect(await other.bands.listAll()).toHaveLength(1);
    expect(await other.setlists.listAll()).toHaveLength(1);
  });

  it('replaces what is there instead of merging', async () => {
    const { store } = await seeded();
    const { store: other } = await seeded();
    const snapshot = await other.bulk.readAll();
    snapshot.songs = snapshot.songs.slice(0, 3);
    snapshot.items = [];
    await store.bulk.replaceAll(snapshot);
    expect(await store.songs.listAll()).toHaveLength(3);
    expect(await store.items.listAll()).toHaveLength(0);
  });

  it('refuses an invalid snapshot and leaves the current data untouched', async () => {
    const { store } = await seeded();
    const bad = await store.bulk.readAll();
    bad.songs[0] = { ...bad.songs[0]!, title: '' };
    await expect(store.bulk.replaceAll(bad)).rejects.toThrow();
    expect(await store.songs.listAll()).toHaveLength(25);
    expect(await store.items.listAll()).toHaveLength(22);

    const noBand = await store.bulk.readAll();
    noBand.bands = [];
    await expect(store.bulk.replaceAll(noBand)).rejects.toThrow();
    expect(await store.bands.listAll()).toHaveLength(1);
  });

  it('erases everything, and the app then starts again from the example', async () => {
    const { store } = await seeded();
    await store.bulk.clearAll();
    expect(await store.bands.listAll()).toHaveLength(0);
    expect((await store.bulk.readAll()).songs).toHaveLength(0);
    await bootstrap(store);
    expect(await store.songs.listAll()).toHaveLength(25);
  });
});
