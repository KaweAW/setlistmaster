import { describe, expect, it } from 'vitest';
import { computeLegend, effectivePerformerIds, effectiveTuningId } from '../legend';
import { setlistStats } from '../stats';
import type { Performer, SetlistItem, Song, Tuning } from '../types';

const base = { bandId: 'b', createdAt: 1, updatedAt: 1 };
const performers: Performer[] = [
  { ...base, id: 'julie', name: 'Julie', color: '#C4245C', symbol: '♀' },
  { ...base, id: 'kawe', name: 'Kawe', color: '#0E7C86', symbol: '♂' },
  { ...base, id: 'coro', name: 'Coro', color: '#6B4BB8', symbol: '∞' },
];
const tunings: Tuning[] = [
  { ...base, id: 'std', name: 'Standard', notes: '', isStandard: true },
  { ...base, id: 'drop', name: 'Drop D', notes: 'D A D G B E', isStandard: false },
];
const song = (id: string, over: Partial<Song> = {}): Song => ({
  ...base, id, title: id, artist: '', capo: 0, tuningId: 'std', defaultPerformerIds: ['julie'], instrumentIds: [],
  chordpro: '', notes: '', tags: [], ...over,
});
const item = (songId: string, over: Partial<SetlistItem> = {}): SetlistItem => ({
  ...base, id: `i-${songId}`, setlistId: 's', blockId: 'bl', songId, position: 'a0', performerIds: [],
  performerNote: '', transitionType: 'none', transitionText: '', notes: '', ...over,
});

describe('effective values', () => {
  it('inherit from the song unless the item overrides them', () => {
    const s = song('a', { defaultPerformerIds: ['julie'], tuningId: 'std' });
    expect(effectivePerformerIds(item('a'), s)).toEqual(['julie']);
    expect(effectivePerformerIds(item('a', { performerIds: ['kawe', 'coro'] }), s)).toEqual(['kawe', 'coro']);
    expect(effectiveTuningId(item('a'), s)).toBe('std');
    expect(effectiveTuningId(item('a', { tuningOverrideId: 'drop' }), s)).toBe('drop');
  });
});

describe('computeLegend', () => {
  it('is empty of symbols for a plain setlist in standard tuning', () => {
    const legend = computeLegend([item('a')], [song('a')], performers, tunings);
    expect(legend).toEqual({ performers: [performers[0]], tuning: false, segue: false, stop: false });
  });

  it('shows only the singers actually used, in the band order', () => {
    const items = [item('a', { performerIds: ['coro'] }), item('b', { performerIds: ['kawe'] })];
    const legend = computeLegend(items, [song('a'), song('b')], performers, tunings);
    expect(legend.performers.map((p) => p.id)).toEqual(['kawe', 'coro']);
  });

  it('shows ♭ when the song itself is in a different tuning', () => {
    const legend = computeLegend([item('a')], [song('a', { tuningId: 'drop' })], performers, tunings);
    expect(legend.tuning).toBe(true);
  });

  it('shows ♭ when only the item overrides the tuning', () => {
    const legend = computeLegend([item('a', { tuningOverrideId: 'drop' })], [song('a')], performers, tunings);
    expect(legend.tuning).toBe(true);
  });

  it('hides ♭ when the override brings a drop-tuned song back to standard', () => {
    const legend = computeLegend(
      [item('a', { tuningOverrideId: 'std' })],
      [song('a', { tuningId: 'drop' })],
      performers,
      tunings,
    );
    expect(legend.tuning).toBe(false);
  });

  it('shows ↳ and ■ only when present', () => {
    const songs = [song('a'), song('b')];
    expect(computeLegend([item('a', { transitionType: 'segue' })], songs, performers, tunings)).toMatchObject({ segue: true, stop: false });
    expect(computeLegend([item('b', { transitionType: 'stop' })], songs, performers, tunings)).toMatchObject({ segue: false, stop: true });
  });

  it('ignores items whose song is missing', () => {
    const legend = computeLegend([item('gone', { transitionType: 'stop', performerIds: ['coro'] })], [], performers, tunings);
    expect(legend).toEqual({ performers: [], tuning: false, segue: false, stop: false });
  });
});

describe('setlistStats', () => {
  it('sums known durations and counts the missing ones', () => {
    const songs = [song('a', { durationSec: 200 }), song('b', { durationSec: 100 }), song('c')];
    const stats = setlistStats([item('a'), item('b'), item('c'), item('gone')], songs);
    expect(stats).toEqual({ songCount: 3, durationSec: 300, missingDurationCount: 1 });
  });
});
