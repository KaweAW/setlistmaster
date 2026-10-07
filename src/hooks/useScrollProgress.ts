import { useEffect, type RefObject } from 'react';
import { calmDevice } from './useHomeMotion';

/**
 * Writes the scroll position on an element as CSS variables, with no React re-render:
 * `--sp` goes 0 → 1 over the first 90px (a header that folds), `--rd` goes 0 → 1 over the whole page (a reading bar).
 */
export function useScrollProgress(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || calmDevice()) return;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      const total = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      el.style.setProperty('--sp', Math.min(1, y / 90).toFixed(3));
      el.style.setProperty('--rd', Math.min(1, y / total).toFixed(4));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref]);
}
