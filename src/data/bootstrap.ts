import type { Band } from '../core/types';
import type { DataStore } from './repository';
import { addDefaultInstruments } from './instruments';
import { addLibrarySongs } from './librarySongs';
import { seedBand } from './seed';

async function run(store: DataStore, defaultBandName: string, preferredId: string | null, language: 'it' | 'en'): Promise<Band> {
  const bands = await store.bands.listAll();
  // If duplicates ever exist (e.g. a past race), the oldest band is the canonical one.
  const oldest = [...bands].sort((a, b) => a.createdAt - b.createdAt)[0];
  const preferred = preferredId ? bands.find((b) => b.id === preferredId) : undefined;
  if (preferred && preferred.id !== oldest?.id) return preferred; // a band joined from the cloud: its songs come from there
  const existing = oldest;
  if (existing) {
    await addDefaultInstruments(store, existing.id, language);
    await addLibrarySongs(store, existing.id); // songs added in later releases reach existing installs too
    return existing;
  }
  const band = await store.bands.create({ name: defaultBandName });
  await seedBand(store, band.id);
  await addDefaultInstruments(store, band.id, language);
  await addLibrarySongs(store, band.id);
  return band;
}

const inflight = new WeakMap<DataStore, Promise<Band>>();

/**
 * First-run setup: if there is no band yet, creates the default local band and the seed data.
 * Idempotent and safe to call concurrently (React StrictMode runs effects twice in development):
 * concurrent calls share a single run. `preferredId` picks another band the device holds (one it joined); if it is gone, the oldest band is used.
 */
export function bootstrap(store: DataStore, defaultBandName = 'My band', preferredId: string | null = null, language: 'it' | 'en' = 'en'): Promise<Band> {
  let promise = inflight.get(store);
  if (!promise) {
    promise = run(store, defaultBandName, preferredId, language).finally(() => inflight.delete(store));
    inflight.set(store, promise);
  }
  return promise;
}
