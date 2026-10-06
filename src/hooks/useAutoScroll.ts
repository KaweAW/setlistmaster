import { useEffect } from 'react';
import { scrollSpeed } from '../core/autoscroll';

/**
 * Scrolls the page at a steady speed while `playing`, and calls `onEnd` at the bottom.
 * Pixels are accumulated before scrolling because browsers round fractional scroll offsets
 * (iOS in particular), which would otherwise make slow speeds stall.
 */
export function useAutoScroll(playing: boolean, level: number, onEnd: () => void): void {
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    let pending = 0;
    const tick = (now: number) => {
      const seconds = Math.min(0.1, (now - last) / 1000); // a long pause (background tab) must not cause a jump
      last = now;
      pending += scrollSpeed(level) * seconds;
      const whole = Math.floor(pending);
      if (whole >= 1) {
        window.scrollBy(0, whole);
        pending -= whole;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        onEnd();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, level, onEnd]);
}
