export const MIN_SCROLL_LEVEL = 1;
export const MAX_SCROLL_LEVEL = 10;

/** Scroll speed for level 1–10, in pixels per second: gentle at 1 (a line every ~7 s), brisk at 10. */
export function scrollSpeed(level: number): number {
  const clamped = Math.min(MAX_SCROLL_LEVEL, Math.max(MIN_SCROLL_LEVEL, Math.round(level)));
  return Math.round(6 * 1.4 ** (clamped - 1));
}

export type SwipeDirection = 'next' | 'previous';

/**
 * Decides whether a touch gesture is a deliberate horizontal swipe: far enough, and clearly more
 * horizontal than vertical, so scrolling the page never changes song. Finger moves left → next song.
 */
export function swipeDirection(dx: number, dy: number, minDistance = 70): SwipeDirection | null {
  if (Math.abs(dx) < minDistance || Math.abs(dx) < Math.abs(dy) * 1.8) return null;
  return dx < 0 ? 'next' : 'previous';
}
