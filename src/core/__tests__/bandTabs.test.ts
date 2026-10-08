import { describe, expect, it } from 'vitest';
import { groupBands } from '../bandTabs';
import type { Band } from '../types';

const band = (id: string, createdAt: number) => ({ id, name: id, createdAt, updatedAt: createdAt }) as Band;

describe('groupBands', () => {
  const bands = [band('joined', 30), band('own', 10), band('second', 20)];
  it('the oldest band is personal while it stays on the device', () => {
    const g = groupBands(bands, new Set(['joined', 'second']));
    expect(g.personal?.id).toBe('own');
    expect(g.shared.map((b) => b.id)).toEqual(['second', 'joined']);
  });
  it('the oldest band that is not shared is the personal one', () => {
    const g = groupBands(bands, new Set(['own']));
    expect(g.personal?.id).toBe('second');
    expect(g.shared.map((b) => b.id)).toEqual(['own']);
  });
  it('without a band that stays local there is no personal tab (the home makes one)', () => {
    expect(groupBands(bands, new Set(['own', 'second', 'joined'])).personal).toBeUndefined();
  });
  it('lists no shared band while signed out, and the personal one stays', () => {
    const g = groupBands(bands, new Set(['joined', 'second']), true);
    expect(g.personal?.id).toBe('own');
    expect(g.shared).toEqual([]);
  });
  it('copes with no bands', () => expect(groupBands([], new Set())).toEqual({ personal: undefined, shared: [] }));
});
