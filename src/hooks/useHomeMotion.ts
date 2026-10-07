import { useEffect, useState, type RefObject } from 'react';

const query = (q: string) => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(q).matches;
export const calmDevice = () => query('(prefers-reduced-motion: reduce)');
const finePointer = () => query('(hover: hover) and (pointer: fine)');

const TILT = 2.2; // degrees at the card's edge
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/**
 * The home's movement, all driven by CSS variables so React does not re-render while it moves:
 *  - scroll: `--sy` (px scrolled, unitless) and `--sp` (0 → 1 over the first 90px) on the root, for the collapsing title,
 *    the parallax and the floating button; returns `compact` once the page has moved;
 *  - rows enter in a staggered way (`data-in`), and the one crossing the middle of the screen is `data-active`;
 *  - mouse: a glow and a small tilt on `[data-fx]` elements (`--mx --my --rx --ry`).
 * With reduced motion nothing here runs and the page is plain. `key` changes when the list does; `ready` is true once the
 * element exists (the page shows a skeleton first).
 */
export function useHomeMotion(root: RefObject<HTMLElement | null>, key: string, ready: boolean): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el || calmDevice()) return;
    let frame = 0;
    let isCompact = false;
    const apply = () => {
      frame = 0;
      const sy = Math.max(0, window.scrollY);
      el.style.setProperty('--sy', String(Math.round(sy)));
      el.style.setProperty('--sp', clamp(sy / 90, 0, 1).toFixed(3));
      const c = sy > 60;
      if (c !== isCompact) {
        isCompact = c;
        setCompact(c);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [root, ready]);

  // Rows enter one after the other as they come into view; the middle one is lifted a little.
  useEffect(() => {
    const el = root.current;
    if (!el || calmDevice() || typeof IntersectionObserver === 'undefined') return;
    el.setAttribute('data-motion', '');
    const rows = [...el.querySelectorAll<HTMLElement>('[data-reveal]')];
    let batch = 0;
    let reset = 0;
    const enter = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).style.setProperty('--d', `${Math.min(batch++, 6) * 55}ms`);
          e.target.setAttribute('data-in', '');
          enter.unobserve(e.target);
        }
        clearTimeout(reset);
        reset = +setTimeout(() => (batch = 0), 120);
      },
      { threshold: 0.08 },
    );
    const middle = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) e.target.setAttribute('data-active', '');
          else e.target.removeAttribute('data-active');
        }
      },
      { rootMargin: '-40% 0px -40% 0px' },
    );
    for (const r of rows) {
      if (!r.hasAttribute('data-in')) enter.observe(r);
      middle.observe(r);
    }
    return () => {
      clearTimeout(reset);
      enter.disconnect();
      middle.disconnect();
      el.removeAttribute('data-motion');
    };
  }, [root, key, ready]);

  // Mouse only: the glow follows the pointer over a card and the card leans toward it.
  useEffect(() => {
    const el = root.current;
    if (!el || calmDevice() || !finePointer()) return;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-fx]');
      if (!card) return;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
      card.style.setProperty('--rx', `${((x - 0.5) * 2 * TILT).toFixed(2)}deg`);
      card.style.setProperty('--ry', `${(-(y - 0.5) * 2 * TILT).toFixed(2)}deg`);
    };
    const leave = (e: PointerEvent) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-fx]');
      card?.style.setProperty('--rx', '0deg');
      card?.style.setProperty('--ry', '0deg');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerout', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerout', leave);
    };
  }, [root, ready]);

  return compact;
}

/** A button that leans a few pixels toward a nearby mouse pointer. */
export function useMagnetic(ref: RefObject<HTMLElement | null>, reach = 90, pull = 0.22) {
  useEffect(() => {
    const el = ref.current;
    if (!el || calmDevice() || !finePointer()) return;
    let frame = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const near = Math.hypot(dx, dy) < reach + r.width / 2;
        el.style.setProperty('--tx', near ? `${(dx * pull).toFixed(1)}px` : '0px');
        el.style.setProperty('--ty', near ? `${(dy * pull).toFixed(1)}px` : '0px');
      });
    };
    window.addEventListener('pointermove', move);
    return () => {
      window.removeEventListener('pointermove', move);
      cancelAnimationFrame(frame);
    };
  }, [ref, reach, pull]);
}
