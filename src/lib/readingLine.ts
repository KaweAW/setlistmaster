/**
 * The height (px from the top of the window) at which a page counts as "being read": a bit above the middle. Near the end of the
 * page the line slides down to the bottom edge, so the last blocks, which can never reach the middle, still light up in turn;
 * and it does not slide before the page has been scrolled, so a short page starts on its first block.
 */
export function readingLine(base = 0.35): number {
  const h = window.innerHeight;
  const top = h * base;
  const span = h - top;
  const remaining = document.documentElement.scrollHeight - h - window.scrollY;
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - h);
  const slide = Math.min(1 - Math.max(0, remaining) / span, window.scrollY / Math.min(span, maxScroll));
  return top + span * Math.min(1, Math.max(0, slide));
}

/** The last element whose top is above the reading line (the first one when none is). */
export function elementAtReadingLine<T extends HTMLElement>(nodes: readonly T[], base = 0.35): T | undefined {
  const line = readingLine(base);
  let current = nodes[0];
  for (const n of nodes) if (n.getBoundingClientRect().top <= line) current = n;
  return current;
}
