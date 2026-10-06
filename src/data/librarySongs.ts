import type { DataStore } from './repository';

/**
 * Songs added to the library after the first release (titles and artists only: no lyrics, no chords).
 * Each song's id is derived from the band and a fixed key: the same on every device of a band (so syncing never
 * duplicates them and a deleted one stays deleted), yet different between bands (two bands on one device never
 * collide). They go in the library, never in a setlist.
 */
export const LIBRARY_ADDITIONS = [
  { key: 'a9395d58-ea19-4751-a153-d2cf1e639e71', title: 'Go With the Flow', artist: 'Queens of the Stone Age' },
  { key: 'a3ed0247-452a-41f7-9aa7-a3dc6613f521', title: 'Zombie', artist: 'The Cranberries' },
  { key: '19a63c88-a465-48a4-bb0c-6c7cc10cbb24', title: 'Sunday Bloody Sunday', artist: 'U2' },
] as const;

/** A stable UUID-shaped id from a band id and a key (SHA-256, formatted as a version-4 UUID). */
export async function libraryId(bandId: string, key: string): Promise<string> {
  const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${bandId}:${key}`)));
  const h = Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, '0'));
  h[6] = '4' + h[6]![1];
  h[8] = ((parseInt(h[8]!, 16) & 0x3f) | 0x80).toString(16);
  const x = h.join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/**
 * Adds the songs above that this band has never had. A song you deleted stays deleted: a soft-deleted
 * record still counts as "had" (`has` looks at deleted records too).
 */
export async function addLibrarySongs(store: DataStore, bandId: string): Promise<void> {
  const tunings = await store.tunings.listBy('bandId', bandId);
  const standard = tunings.find((t) => t.isStandard) ?? tunings[0];
  if (!standard) return;
  for (const song of LIBRARY_ADDITIONS) {
    const id = await libraryId(bandId, song.key);
    if (await store.songs.has(id)) continue;
    await store.songs.create({
      id, bandId, title: song.title, artist: song.artist, capo: 0, tuningId: standard.id,
      defaultPerformerIds: [], instrumentIds: [], chordpro: '', notes: '', tags: [],
    });
  }
}
