import { describe, expect, it } from 'vitest';
import { collectTags, EMPTY_FILTERS, filterSongs, sortSongs } from '../songFilter';
import { normalizeTags } from '../tags';
import { performerUsage, tuningUsage } from '../usage';
import type { SetlistItem, Song } from '../types';

const song = (over: Partial<Song> & { title: string }): Song => ({
  id: over.title,
  bandId: 'b',
  createdAt: 1,
  updatedAt: 1,
  artist: '',
  capo: 0,
  tuningId: 'std',
  defaultPerformerIds: [],
  chordpro: '',
  notes: '',
  tags: [],
  ...over,
});

const songs = [
  song({ title: 'Don’t Let Me Down', artist: 'Beatles', defaultPerformerIds: ['j', 'c'], tags: ['Rock'], updatedAt: 3 }),
  song({ title: 'Creep', artist: 'Radiohead', defaultPerformerIds: ['j'], tags: ['rock', 'Slow'], updatedAt: 5 }),
  song({ title: 'The Chain', artist: 'Fleetwood Mac', tuningId: 'drop', defaultPerformerIds: ['j', 'k'], updatedAt: 1 }),
  song({ title: 'Спокойная ночь', artist: 'Кино', defaultPerformerIds: ['k'], updatedAt: 2 }),
];

describe('filterSongs', () => {
  it('matches everything with empty filters', () => {
    expect(filterSongs(songs, EMPTY_FILTERS)).toHaveLength(4);
  });
  it('searches title and artist, ignoring case, accents and curly quotes', () => {
    expect(filterSongs(songs, { ...EMPTY_FILTERS, query: "don't" }).map((s) => s.title)).toEqual(['Don’t Let Me Down']);
    expect(filterSongs(songs, { ...EMPTY_FILTERS, query: 'RADIO' })).toHaveLength(1);
    expect(filterSongs(songs, { ...EMPTY_FILTERS, query: 'chain mac' })).toHaveLength(1);
    expect(filterSongs(songs, { ...EMPTY_FILTERS, query: 'кино' })).toHaveLength(1);
  });
  it('filters by tag, tuning and performer', () => {
    expect(filterSongs(songs, { ...EMPTY_FILTERS, tag: 'ROCK' })).toHaveLength(2);
    expect(filterSongs(songs, { ...EMPTY_FILTERS, tuningId: 'drop' })).toHaveLength(1);
    expect(filterSongs(songs, { ...EMPTY_FILTERS, performerId: 'j' })).toHaveLength(3);
  });
  it('combines filters', () => {
    expect(filterSongs(songs, { ...EMPTY_FILTERS, performerId: 'j', tag: 'slow' }).map((s) => s.title)).toEqual(['Creep']);
  });
});

describe('sortSongs', () => {
  it('sorts by title, artist and recency without mutating the input', () => {
    const before = songs.map((s) => s.title);
    expect(sortSongs(songs, 'title')[0]?.title).toBe('Creep');
    expect(sortSongs(songs, 'artist')[0]?.artist).toBe('Beatles');
    expect(sortSongs(songs, 'recent').map((s) => s.updatedAt)).toEqual([5, 3, 2, 1]);
    expect(songs.map((s) => s.title)).toEqual(before);
  });
});

describe('tags', () => {
  it('collects distinct tags case-insensitively', () => {
    expect(collectTags(songs)).toEqual(['Rock', 'Slow']);
  });
  it('normalizes tags', () => {
    expect(normalizeTags([' rock ', 'Rock', '', 'slow   ballad'])).toEqual(['rock', 'slow ballad']);
  });
});

describe('usage', () => {
  const item = (over: Partial<SetlistItem>): SetlistItem => ({
    id: 'i', bandId: 'b', createdAt: 1, updatedAt: 1, setlistId: 's', blockId: 'bl', songId: 'x',
    position: 'a0', performerIds: [], performerNote: '', transitionType: 'none', transitionText: '', notes: '',
    ...over,
  });
  it('counts tuning usage on songs and item overrides', () => {
    expect(tuningUsage('drop', songs, [item({ tuningOverrideId: 'drop' }), item({})])).toBe(2);
    expect(tuningUsage('none', songs, [])).toBe(0);
  });
  it('counts performer usage on songs and items', () => {
    expect(performerUsage('k', songs, [item({ performerIds: ['k'] })])).toBe(3);
  });
});
