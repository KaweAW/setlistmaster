import { describe, expect, it } from 'vitest';
import { clampBpm, tapTempo } from '../metronome';
import { setlistStats } from '../stats';
import type { SetlistItem, Song } from '../types';

describe('tapTempo', () => {
  it('needs two taps', () => expect(tapTempo([0])).toBeUndefined());
  it('derives BPM from the gaps', () => expect(tapTempo([0, 500, 1000, 1500])).toBe(120));
  it('restarts after a pause', () => expect(tapTempo([0, 500, 10_000, 10_600])).toBe(100));
  it('clamps', () => {
    expect(clampBpm(5)).toBe(30);
    expect(clampBpm(999)).toBe(300);
  });
});

describe('setlistStats with reserve blocks', () => {
  const song = (id: string, durationSec: number) => ({ id, durationSec }) as Song;
  const item = (id: string, blockId: string, songId: string) => ({ id, blockId, songId }) as SetlistItem;
  it('leaves out the songs of reserve blocks', () => {
    const stats = setlistStats(
      [item('1', 'main', 'a'), item('2', 'bis', 'b')],
      [song('a', 200), song('b', 300)],
      new Set(['bis']),
    );
    expect(stats).toEqual({ songCount: 1, durationSec: 200, missingDurationCount: 0 });
  });
});
