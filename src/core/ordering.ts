import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

/** Position for a new item between two neighbours (either may be null = list edge). */
export function positionBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

/** `count` ordered positions to append after `last` (or to start a list when null). */
export function positionsAfter(last: string | null, count: number): string[] {
  return generateNKeysBetween(last, null, count);
}

/** Compare two positions. Plain string comparison, as fractional indexes are designed for. */
export function comparePositions(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortByPosition<T extends { position: string }>(items: readonly T[]): T[] {
  return [...items].sort((x, y) => comparePositions(x.position, y.position));
}

/**
 * Position to give a moved item dropped at `toIndex` of `siblings`
 * (siblings must NOT contain the moved item, and must already be sorted).
 */
export function positionForIndex(siblings: readonly { position: string }[], toIndex: number): string {
  const i = Math.max(0, Math.min(toIndex, siblings.length));
  const before = i > 0 ? (siblings[i - 1]?.position ?? null) : null;
  const after = i < siblings.length ? (siblings[i]?.position ?? null) : null;
  return generateKeyBetween(before, after);
}
