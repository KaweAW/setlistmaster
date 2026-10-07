import { useEffect, useRef } from 'react';
import { calmDevice } from '../hooks/useHomeMotion';

/**
 * Three very pale colour washes (teal, pink, violet) behind the app. They drift after the mouse and, a little, with
 * the scroll, so the page feels alive without anything moving in front of the text. Still when motion is reduced.
 */
export function AmbientBackground() {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || calmDevice()) return;
    const fine = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;
    let tx = 0, ty = 0, x = 0, y = 0, frame = 0;
    const tick = () => {
      x += (tx - x) * 0.06;
      y += (ty - y) * 0.06;
      el.style.setProperty('--ax', x.toFixed(1));
      el.style.setProperty('--ay', y.toFixed(1));
      el.style.setProperty('--as', String(Math.round(window.scrollY)));
      frame = Math.abs(tx - x) + Math.abs(ty - y) > 0.2 ? requestAnimationFrame(tick) : 0;
    };
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const move = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
      wake();
    };
    if (fine) window.addEventListener('pointermove', move);
    window.addEventListener('scroll', wake, { passive: true });
    wake();
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('scroll', wake);
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div ref={box} aria-hidden className="ambient pointer-events-none fixed inset-0 -z-10 overflow-hidden print:hidden">
      <i className="ambient-blob ambient-io" />
      <i className="ambient-blob ambient-lei" />
      <i className="ambient-blob ambient-coro" />
    </div>
  );
}
