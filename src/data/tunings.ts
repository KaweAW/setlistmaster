import { isStandardStrings, nameForStrings, standardStrings, stringsKey, tuningStrings } from '../core/tuning';
import type { Tuning } from '../core/types';
import type { DataStore } from './repository';

/** The strings of a stored tuning, whatever way it was typed ("EADGBE", "D-G-C-F-A-D", a name…). Null for free text. */
export function stringsOf(tuning: Tuning): string[] | null {
  if (tuning.isStandard) return standardStrings();
  return tuningStrings(tuning.notes) ?? tuningStrings(tuning.name);
}

/** The one way a tuning is written: notes separated by spaces ("D A D G B E"), named after what it is ("Drop D"). */
export const tuningFormat = (strings: readonly string[]): { name: string; notes: string } => ({
  name: nameForStrings(strings),
  notes: strings.join(' '),
});

/** The stored tuning for these strings: the band's standard one, an existing match, or a new one. */
export async function tuningIdFor(store: DataStore, bandId: string, strings: readonly string[]): Promise<string> {
  const list = await store.tunings.listBy('bandId', bandId);
  if (isStandardStrings(strings)) {
    const standard = list.find((x) => x.isStandard) ?? list.find((x) => { const s = stringsOf(x); return s && isStandardStrings(s); });
    if (standard) return standard.id;
  }
  const key = stringsKey(strings);
  const same = list.find((x) => { const s = stringsOf(x); return s && stringsKey(s) === key; });
  if (same) return same.id;
  return (await store.tunings.create({ bandId, isStandard: isStandardStrings(strings), ...tuningFormat(strings) })).id;
}

/**
 * Brings the tunings of a band to one format: every tuning that can be read gets its canonical name and notes, those that
 * are the same set of strings (typed in different ways over time, or "standard" written as a custom one) are merged into
 * one, and the songs and setlist items that pointed at a duplicate follow. A setlist override equal to the song's own
 * tuning is dropped. Free-text tunings that are not a list of notes are left alone. Safe to run again.
 */
export async function normalizeTunings(store: DataStore, bandId: string): Promise<void> {
  const tunings = (await store.tunings.listBy('bandId', bandId)).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  if (tunings.length === 0) return;
  const canonical = new Map<string, Tuning>(); // strings key → the tuning that stays
  const redirect = new Map<string, string>(); // duplicate id → canonical id
  // The standard tuning goes first so every "EADGBE" ends up on it.
  const ordered = [...tunings.filter((x) => x.isStandard), ...tunings.filter((x) => !x.isStandard)];
  for (const tuning of ordered) {
    const strings = stringsOf(tuning);
    if (!strings) continue;
    const key = stringsKey(strings);
    const keeper = canonical.get(key);
    if (keeper) { redirect.set(tuning.id, keeper.id); continue; }
    canonical.set(key, tuning);
    const wanted = tuningFormat(strings);
    const standard = isStandardStrings(strings);
    if (tuning.name !== wanted.name || tuning.notes !== wanted.notes || (standard && !tuning.isStandard)) {
      await store.tunings.update(tuning.id, { ...wanted, isStandard: tuning.isStandard || standard });
    }
  }
  const [songs, items] = await Promise.all([store.songs.listBy('bandId', bandId), store.items.listBy('bandId', bandId)]);
  const songTuning = new Map<string, string>();
  for (const song of songs) {
    const to = redirect.get(song.tuningId);
    if (to) await store.songs.update(song.id, { tuningId: to });
    songTuning.set(song.id, to ?? song.tuningId);
  }
  for (const item of items) {
    if (!item.tuningOverrideId) continue;
    const to = redirect.get(item.tuningOverrideId) ?? item.tuningOverrideId;
    if (to === songTuning.get(item.songId)) await store.items.update(item.id, { tuningOverrideId: undefined });
    else if (to !== item.tuningOverrideId) await store.items.update(item.id, { tuningOverrideId: to });
  }
  for (const id of redirect.keys()) await store.tunings.remove(id);
}
