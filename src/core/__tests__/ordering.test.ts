import { describe, expect, it } from 'vitest';
import { positionBetween, positionForIndex, positionsAfter, sortByPosition } from '../ordering';

describe('ordering', () => {
  it('creates increasing positions', () => {
    const [a, b, c] = positionsAfter(null, 3) as [string, string, string];
    expect(a < b && b < c).toBe(true);
  });

  it('inserts between neighbours without touching them', () => {
    const [a, b] = positionsAfter(null, 2) as [string, string];
    const mid = positionBetween(a, b);
    expect(a < mid && mid < b).toBe(true);
  });

  it('keeps a total order when inserting repeatedly at the same spot', () => {
    const [a, b] = positionsAfter(null, 2) as [string, string];
    const first = positionBetween(a, b);
    const second = positionBetween(a, first);
    expect(a < second && second < first && first < b).toBe(true);
  });

  it('computes the position for a drop index', () => {
    const items = positionsAfter(null, 3).map((position) => ({ position }));
    const atStart = positionForIndex(items, 0);
    const middle = positionForIndex(items, 1);
    const atEnd = positionForIndex(items, 3);
    expect(atStart < items[0]!.position).toBe(true);
    expect(items[0]!.position < middle && middle < items[1]!.position).toBe(true);
    expect(atEnd > items[2]!.position).toBe(true);
  });

  it('sorts by position', () => {
    const [a, b, c] = positionsAfter(null, 3) as [string, string, string];
    const sorted = sortByPosition([{ position: c }, { position: a }, { position: b }]);
    expect(sorted.map((x) => x.position)).toEqual([a, b, c]);
  });
});
