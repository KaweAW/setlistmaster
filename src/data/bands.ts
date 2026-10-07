import type { Band } from '../core/types';
import { addDefaultInstruments } from './instruments';
import type { DataStore } from './repository';

/** A new band on this device, ready to use (it has the default instruments, no songs). */
export async function createLocalBand(store: DataStore, name: string, language: 'it' | 'en'): Promise<Band> {
  const band = await store.bands.create({ name: name.trim() });
  await addDefaultInstruments(store, band.id, language);
  return band;
}

export interface BandCounts {
  setlists: number;
  songs: number;
}

/** What a band holds, to tell the person what deleting it would take away. */
export async function countBand(store: DataStore, bandId: string): Promise<BandCounts> {
  const [setlists, songs] = await Promise.all([store.setlists.listBy('bandId', bandId), store.songs.listBy('bandId', bandId)]);
  return { setlists: setlists.length, songs: songs.length };
}

/** Removes a band and everything in it from this device (soft delete, like every other deletion). */
export async function removeLocalBand(store: DataStore, bandId: string): Promise<void> {
  const repos = [store.items, store.blocks, store.setlists, store.attachments, store.parts, store.songs, store.instruments, store.performers, store.tunings, store.members] as const;
  for (const repo of repos) {
    const rows = await (repo as { listBy: (f: 'bandId', v: string) => Promise<{ id: string }[]> }).listBy('bandId', bandId);
    for (const row of rows) await (repo as { remove: (id: string) => Promise<void> }).remove(row.id);
  }
  await store.bands.remove(bandId);
}

const personalRuns = new WeakMap<DataStore, Promise<boolean>>();

/**
 * Makes sure the device has a band that is only on this device (the personal space). Checks the database itself, and
 * concurrent calls share one run, so two renders can never make two. Returns true if it made one.
 */
export function ensurePersonalBand(store: DataStore, name: string, language: 'it' | 'en'): Promise<boolean> {
  let run = personalRuns.get(store);
  if (!run) {
    run = (async () => {
      const [bands, linked] = await Promise.all([store.bands.listAll(), store.sync.linkedBands()]);
      if (bands.length === 0 || bands.some((b) => !linked.includes(b.id))) return false; // bootstrap makes the very first band
      await createLocalBand(store, name, language);
      return true;
    })().finally(() => personalRuns.delete(store));
    personalRuns.set(store, run);
  }
  return run;
}
