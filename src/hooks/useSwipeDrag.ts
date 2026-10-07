import { useRef, type RefObject, type TouchEvent } from 'react';
import { swipeDirection, type SwipeDirection } from '../core/autoscroll';

const MIN_DRAG = 12;

/**
 * A horizontal drag that the page follows with the finger. While dragging it writes CSS variables on `ref`:
 * `--cx` (content offset), `--co` (content opacity) and `--drag` (-dx/180: progress of the tab highlight);
 * `data-dragging` switches the CSS transitions off so the movement is 1:1. On release, a deliberate swipe calls `onCommit`.
 * `allow` says what a direction does: 'follow' (the content moves along), 'trigger' (acts on release only) or null.
 */
export function useSwipeDrag(
  ref: RefObject<HTMLElement | null>,
  allow: (direction: SwipeDirection) => 'follow' | 'trigger' | null,
  onCommit: (direction: SwipeDirection) => void,
) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const mode = useRef<'h' | 'v' | null>(null);

  const apply = (dx: number | null) => {
    const el = ref.current;
    if (!el) return;
    if (dx === null) {
      delete el.dataset.dragging;
      el.style.setProperty('--cx', '0px');
      el.style.setProperty('--co', '1');
      el.style.setProperty('--drag', '0');
      return;
    }
    el.dataset.dragging = '1';
    el.style.setProperty('--cx', `${dx * 0.45}px`);
    el.style.setProperty('--co', String(1 - Math.min(Math.abs(dx) / 420, 0.45)));
    el.style.setProperty('--drag', String(Math.max(-1, Math.min(1, -dx / 180))));
  };

  return {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      start.current = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null;
      mode.current = null;
    },
    onTouchMove: (e: TouchEvent) => {
      const s = start.current;
      const t = e.touches[0];
      if (!s || !t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (mode.current === null) {
        if (Math.abs(dx) > MIN_DRAG && Math.abs(dx) > Math.abs(dy) * 1.8) mode.current = 'h';
        else if (Math.abs(dy) > MIN_DRAG) mode.current = 'v';
      }
      if (mode.current !== 'h') return;
      apply(allow(dx < 0 ? 'next' : 'previous') === 'follow' ? dx : 0);
    },
    onTouchEnd: (e: TouchEvent) => {
      const s = start.current;
      const t = e.changedTouches[0];
      start.current = null;
      const wasDrag = mode.current === 'h';
      mode.current = null;
      if (!s || !t) return;
      const direction = swipeDirection(t.clientX - s.x, t.clientY - s.y);
      const kind = direction ? allow(direction) : null;
      if (wasDrag && direction && kind === 'follow') {
        // keep going the same way while the band changes: the new content then comes in from the other side
        const el = ref.current;
        if (el) {
          el.style.setProperty('--cx', `${direction === 'next' ? -48 : 48}px`);
          el.style.setProperty('--co', '0');
          delete el.dataset.dragging;
        }
      } else apply(null);
      if (direction && kind) onCommit(direction);
    },
    onTouchCancel: () => {
      start.current = null;
      mode.current = null;
      apply(null);
    },
  };
}

/** Puts the content back in place without animating it (used when the new band's content has arrived). */
export function resetSwipe(el: HTMLElement | null) {
  if (!el) return;
  el.dataset.dragging = '1';
  el.style.setProperty('--cx', '0px');
  el.style.setProperty('--co', '1');
  el.style.setProperty('--drag', '0');
  requestAnimationFrame(() => { delete el.dataset.dragging; });
}
