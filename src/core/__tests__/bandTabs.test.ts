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
  it('once the own band is shared there is no personal tab', () => {
    const g = groupBands(bands, new Set(['own']));
    expect(g.personal).toBeUndefined();
    expect(g.shared.map((b) => b.id)).toEqual(['own']);
  });
  it('copes with no bands', () => expect(groupBands([], new Set())).toEqual({ personal: undefined, shared: [] }));
});
