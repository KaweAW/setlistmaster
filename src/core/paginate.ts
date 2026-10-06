/**
 * Splits a setlist over fixed-height pages (the A4 PDF). Heights are measured by the caller in the
 * browser; this function only decides where pages break, so it is pure and testable.
 *
 * Rules, in order:
 *  1. A block that fits in the room left on the page stays there.
 *  2. Otherwise, if the whole block fits on a fresh page, it starts a new page (like the prototype,
 *     where pages broke between blocks).
 *  3. Only a block taller than a page is split, between songs (a song and its transition never split);
 *     each continuation starts with the block heading again.
 */
export interface PaginateBlock {
  id: string;
  headingHeight: number;
  rowHeights: readonly number[];
}

export interface PageChunk {
  blockId: string;
  /** Rows [from, to) of the block shown on this page. */
  from: number;
  to: number;
  /** True when this chunk continues a block started on the previous page. */
  continued: boolean;
}

export interface PaginateOptions {
  blocks: readonly PaginateBlock[];
  /** Usable height of a page. */
  pageCapacity: number;
  /** Usable height left on page 1 once the poster header is placed. */
  firstPageCapacity: number;
  /** Space above every block heading. */
  blockGap: number;
}

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

export function paginateBlocks(options: PaginateOptions): PageChunk[][] {
  const { blocks, pageCapacity, blockGap } = options;
  const pages: PageChunk[][] = [[]];
  let capacity = options.firstPageCapacity;
  let used = 0;

  const current = () => pages[pages.length - 1]!;
  const startPage = () => {
    pages.push([]);
    capacity = pageCapacity;
    used = 0;
  };

  for (const block of blocks) {
    const rows = block.rowHeights;
    const head = blockGap + block.headingHeight;
    const total = head + sum(rows);
    const whole: PageChunk = { blockId: block.id, from: 0, to: rows.length, continued: false };

    if (used + total <= capacity) {
      current().push(whole);
      used += total;
      continue;
    }
    if (current().length > 0 && total <= pageCapacity) {
      startPage();
      current().push(whole);
      used = total;
      continue;
    }

    // Taller than a page (or the very first thing on an already full page): split between songs.
    let from = 0;
    let continued = false;
    for (;;) {
      let height = head;
      let to = from;
      while (to < rows.length && (used + height + rows[to]! <= capacity || (to === from && current().length === 0))) {
        height += rows[to]!;
        to += 1;
      }
      if (to === from && rows.length > 0) {
        startPage(); // not even one song fits here: the next iteration places one by force
        continue;
      }
      current().push({ blockId: block.id, from, to, continued });
      used += height;
      if (to >= rows.length) break;
      from = to;
      continued = true;
      startPage();
    }
  }
  return pages;
}
