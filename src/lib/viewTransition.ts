import { flushSync } from 'react-dom';

type Doc = Document & { startViewTransition?: (update: () => Promise<void> | void) => unknown };

/**
 * Goes to a page while the element marked `from` flies into the element marked `[data-vt-to]` of the new page (the browser's
 * View Transitions). Where that is not available, or motion is reduced, it just navigates. Returns true when it took over the click.
 */
export function flyTo(from: HTMLElement | null, name: string, go: () => void): boolean {
  const doc = document as Doc;
  if (!from || !doc.startViewTransition || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  from.style.setProperty('view-transition-name', name);
  doc.startViewTransition(async () => {
    flushSync(go);
    from.style.removeProperty('view-transition-name');
    // The new page loads its data first: wait (briefly) until its title is there to land on.
    const until = performance.now() + 600;
    while (!document.querySelector(`[data-vt-to="${name}"]`) && performance.now() < until) {
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  return true;
}
