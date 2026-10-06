import { describe, expect, it } from 'vitest';
import { paginateBlocks, type PaginateBlock } from '../paginate';

const block = (id: string, rows: number, rowHeight = 10, headingHeight = 20): PaginateBlock => ({
  id,
  headingHeight,
  rowHeights: Array.from({ length: rows }, () => rowHeight),
});
const base = { pageCapacity: 200, firstPageCapacity: 150, blockGap: 5 };
const summary = (pages: ReturnType<typeof paginateBlocks>) =>
  pages.map((p) => p.map((c) => `${c.blockId}:${c.from}-${c.to}${c.continued ? '*' : ''}`));

describe('paginateBlocks', () => {
  it('gives one (empty) page for an empty setlist', () => {
    expect(paginateBlocks({ ...base, blocks: [] })).toEqual([[]]);
  });

  it('keeps everything on one page when it fits', () => {
    const pages = paginateBlocks({ ...base, blocks: [block('a', 4), block('b', 3)] });
    expect(summary(pages)).toEqual([['a:0-4', 'b:0-3']]);
  });

  it('moves a block that does not fit to the next page instead of splitting it', () => {
    // a = 5+20+60 = 85; b = 85 does not fit in the 65 left of page 1, but fits on a fresh page
    const pages = paginateBlocks({ ...base, blocks: [block('a', 6), block('b', 6)] });
    expect(summary(pages)).toEqual([['a:0-6'], ['b:0-6']]);
  });

  it('fills the next page with the following blocks', () => {
    const pages = paginateBlocks({ ...base, blocks: [block('a', 6), block('b', 6), block('c', 2), block('d', 2)] });
    expect(summary(pages)).toEqual([['a:0-6'], ['b:0-6', 'c:0-2', 'd:0-2']]);
  });

  it('splits only a block taller than a page, repeating its heading', () => {
    // 5 + 20 + 30 rows * 10 = 325 > 200
    const pages = paginateBlocks({ ...base, blocks: [block('big', 30)] });
    expect(pages.length).toBe(3);
    expect(pages[0]![0]).toMatchObject({ from: 0, continued: false });
    expect(pages[1]![0]).toMatchObject({ continued: true });
    expect(pages[2]![0]).toMatchObject({ continued: true, to: 30 });
    // every row appears exactly once, in order
    const rows = pages.flatMap((p) => p.flatMap((c) => Array.from({ length: c.to - c.from }, (_, i) => c.from + i)));
    expect(rows).toEqual(Array.from({ length: 30 }, (_, i) => i));
  });

  it('never exceeds the page capacity, except for a single oversize song', () => {
    const blocks = [block('a', 7), block('b', 12), block('c', 25), block('d', 1)];
    const pages = paginateBlocks({ ...base, blocks });
    pages.forEach((page, i) => {
      const used = page.reduce((total, c) => {
        const b = blocks.find((x) => x.id === c.blockId)!;
        return total + base.blockGap + b.headingHeight + b.rowHeights.slice(c.from, c.to).reduce((x, y) => x + y, 0);
      }, 0);
      expect(used).toBeLessThanOrEqual(i === 0 ? base.firstPageCapacity : base.pageCapacity);
    });
  });

  it('always makes progress, even if a song is taller than the page', () => {
    const pages = paginateBlocks({
      blocks: [{ id: 'x', headingHeight: 10, rowHeights: [500, 500] }],
      pageCapacity: 100,
      firstPageCapacity: 80,
      blockGap: 5,
    });
    expect(pages.flat().map((c) => `${c.from}-${c.to}`)).toEqual(['0-1', '1-2']);
  });

  it('places a heading-only block', () => {
    expect(summary(paginateBlocks({ ...base, blocks: [block('empty', 0), block('a', 2)] }))).toEqual([
      ['empty:0-0', 'a:0-2'],
    ]);
  });
});
