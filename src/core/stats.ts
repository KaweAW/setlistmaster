import type { SetlistItem, Song } from './types';

export interface SetlistStats {
  songCount: number;
  /** Sum of the known durations, in seconds. */
  durationSec: number;
  /** Songs without a duration: when > 0 the total is partial. */
  missingDurationCount: number;
}

export function setlistStats(items: readonly SetlistItem[], songs: readonly Song[]): SetlistStats {
  const songById = new Map(songs.map((s) => [s.id, s]));
  let songCount = 0;
  let durationSec = 0;
  let missingDurationCount = 0;
  for (const item of items) {
    const song = songById.get(item.songId);
    if (!song) continue;
    songCount += 1;
    if (song.durationSec) durationSec += song.durationSec;
    else missingDurationCount += 1;
  }
  return { songCount, durationSec, missingDurationCount };
}
