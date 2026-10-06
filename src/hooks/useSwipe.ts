import { useRef, type TouchEvent } from 'react';
import { swipeDirection, type SwipeDirection } from '../core/autoscroll';

/** Touch handlers that report a deliberate horizontal swipe (see swipeDirection). Pinch gestures are ignored. */
export function useSwipe(onSwipe: (direction: SwipeDirection) => void, enabled = true) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: TouchEvent) => {
      const touch = e.touches[0];
      start.current = e.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY } : null;
    },
    onTouchEnd: (e: TouchEvent) => {
      const from = start.current;
      start.current = null;
      const touch = e.changedTouches[0];
      if (!enabled || !from || !touch) return;
      const direction = swipeDirection(touch.clientX - from.x, touch.clientY - from.y);
      if (direction) onSwipe(direction);
    },
  };
}
