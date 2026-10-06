import type { Song } from './types';

export type SongSort = 'title' | 'artist' | 'recent';

export interface SongFilters {
  query: string;
  tag: string;
  tuningId: string;
  performerId: string;
}

export const EMPTY_FILTERS: SongFilters = { query: '', tag: '', tuningId: '', performerId: '' };

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Lowercase, accent-insensitive, curly quotes → straight, for forgiving search. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .trim();
}

/** Every word of the query must appear in title or artist. Empty filters match everything. */
export function filterSongs(songs: readonly Song[], filters: SongFilters): Song[] {
  const terms = normalizeText(filters.query).split(/\s+/).filter(Boolean);
  const tag = normalizeText(filters.tag);
  return songs.filter((song) => {
    if (terms.length > 0) {
      const haystack = normalizeText(`${song.title} ${song.artist}`);
      if (!terms.every((term) => haystack.includes(term))) return false;
    }
    if (tag && !song.tags.some((t) => normalizeText(t) === tag)) return false;
    if (filters.tuningId && song.tuningId !== filters.tuningId) return false;
    if (filters.performerId && !song.defaultPerformerIds.includes(filters.performerId)) return false;
    return true;
  });
}

export function sortSongs(songs: readonly Song[], sort: SongSort): Song[] {
  const copy = [...songs];
  switch (sort) {
    case 'title':
      return copy.sort((a, b) => collator.compare(a.title, b.title));
    case 'artist':
      return copy.sort((a, b) => collator.compare(a.artist, b.artist) || collator.compare(a.title, b.title));
    case 'recent':
      return copy.sort((a, b) => b.updatedAt - a.updatedAt);
  }
}

/** All distinct tags used by the songs (case-insensitive), alphabetically. */
export function collectTags(songs: readonly Song[]): string[] {
  const byKey = new Map<string, string>();
  for (const song of songs) {
    for (const tag of song.tags) {
      const key = tag.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, tag);
    }
  }
  return [...byKey.values()].sort((a, b) => collator.compare(a, b));
}
