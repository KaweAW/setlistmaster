import type { Setlist } from './types';

/** Today as YYYY-MM-DD in the device's own time zone. Kept out of components so rendering stays pure. */
export function todayIso(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Whole days from `today` to `date` (both YYYY-MM-DD): 0 today, 1 tomorrow, negative in the past. NaN if unreadable. */
export function daysUntil(date: string, today: string): number {
  const a = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
  const b = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  return Math.round((a - b) / 86_400_000);
}

/** The nearest setlist that is today or later, ignoring archived and undated ones. */
export function nextUpcoming(setlists: readonly Setlist[], today: string): Setlist | null {
  let best: Setlist | null = null;
  for (const s of setlists) {
    if (s.archived || !s.date || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) continue;
    if (s.date < today) continue;
    if (!best || s.date < best.date!) best = s;
  }
  return best;
}
