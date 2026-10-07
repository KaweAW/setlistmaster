import { describe, expect, it } from 'vitest';
import { daysUntil, nextUpcoming, todayIso } from '../countdown';
import type { Setlist } from '../types';

const sl = (id: string, date?: string, archived = false) => ({ id, date, archived }) as unknown as Setlist;

describe('countdown', () => {
  it('formats today in local time', () => {
    expect(todayIso(new Date(2026, 9, 7, 23, 59))).toBe('2026-10-07');
    expect(todayIso(new Date(2026, 0, 3))).toBe('2026-01-03');
  });
  it('counts whole days, across months and years', () => {
    expect(daysUntil('2026-10-07', '2026-10-07')).toBe(0);
    expect(daysUntil('2026-10-08', '2026-10-07')).toBe(1);
    expect(daysUntil('2027-01-01', '2026-12-31')).toBe(1);
    expect(daysUntil('2026-10-01', '2026-10-07')).toBe(-6);
    expect(daysUntil('2026-03-29', '2026-03-28')).toBe(1); // daylight saving does not shift it
  });
  it('picks the nearest upcoming, skipping archived, past and undated', () => {
    const list = [sl('a', '2026-10-01'), sl('b', '2026-12-01'), sl('c', '2026-10-20'), sl('d', '2026-10-08', true), sl('e')];
    expect(nextUpcoming(list, '2026-10-07')?.id).toBe('c');
    expect(nextUpcoming(list, '2026-12-02')).toBeNull();
    expect(nextUpcoming([sl('x', '2026-10-07')], '2026-10-07')?.id).toBe('x');
  });
});
