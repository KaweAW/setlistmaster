import type { SetlistItem, Song } from './types';

/** How many songs/items reference a tuning (used to block deleting a tuning that is in use). */
export function tuningUsage(
  tuningId: string,
  songs: readonly Song[],
  items: readonly SetlistItem[],
): number {
  return (
    songs.filter((s) => s.tuningId === tuningId).length +
    items.filter((i) => i.tuningOverrideId === tuningId).length
  );
}

/** How many songs/items reference a performer. */
export function performerUsage(
  performerId: string,
  songs: readonly Song[],
  items: readonly SetlistItem[],
): number {
  return (
    songs.filter((s) => s.defaultPerformerIds.includes(performerId)).length +
    items.filter((i) => i.performerIds.includes(performerId)).length
  );
}
