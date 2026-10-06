import type { Performer, SetlistItem, Song, Tuning } from './types';

/** Singers of an item: its own choice, or the song's defaults when it has none. */
export function effectivePerformerIds(item: SetlistItem, song: Song | undefined): string[] {
  return item.performerIds.length > 0 ? item.performerIds : (song?.defaultPerformerIds ?? []);
}

/** Tuning of an item: the one set for this setlist, or the song's own. */
export function effectiveTuningId(item: SetlistItem, song: Song | undefined): string | undefined {
  return item.tuningOverrideId ?? song?.tuningId;
}

export interface Legend {
  /** Only the singers actually used, in the order of the band's singer list. */
  performers: Performer[];
  /** ♭ "different tuning": at least one item is not in standard tuning. */
  tuning: boolean;
  /** ↳ direct segue: at least one item has it. */
  segue: boolean;
  /** ■ hard stop: at least one item has it. */
  stop: boolean;
}

/**
 * The legend of a setlist is computed, never written by hand (brief, section 6).
 * Items whose song no longer exists are ignored, as they are not shown either.
 */
export function computeLegend(
  items: readonly SetlistItem[],
  songs: readonly Song[],
  performers: readonly Performer[],
  tunings: readonly Tuning[],
): Legend {
  const songById = new Map(songs.map((s) => [s.id, s]));
  const tuningById = new Map(tunings.map((t) => [t.id, t]));
  const usedPerformers = new Set<string>();
  let tuning = false;
  let segue = false;
  let stop = false;

  for (const item of items) {
    const song = songById.get(item.songId);
    if (!song) continue;
    for (const id of effectivePerformerIds(item, song)) usedPerformers.add(id);
    const tuningId = effectiveTuningId(item, song);
    const effective = tuningId ? tuningById.get(tuningId) : undefined;
    if (effective && !effective.isStandard) tuning = true;
    if (item.transitionType === 'segue') segue = true;
    if (item.transitionType === 'stop') stop = true;
  }

  return {
    performers: performers.filter((p) => usedPerformers.has(p.id)),
    tuning,
    segue,
    stop,
  };
}
