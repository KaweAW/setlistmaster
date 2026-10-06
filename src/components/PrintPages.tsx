import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { itemsOfBlock, sortedBlocks, type SetlistTree } from '../core/setlistOps';
import { paginateBlocks, type PageChunk } from '../core/paginate';
import type { Performer, Song, Tuning } from '../core/types';
import { buildLookups, PosterBlockHeading, PosterHeader, PosterRow } from './setlistParts';
import '../print.css';

const PAGE_PX = 96 / 25.4; // CSS pixels per millimetre
const PAGE_WIDTH_PX = 210 * PAGE_PX;

interface Props {
  tree: SetlistTree;
  songs: Song[];
  performers: Performer[];
  tunings: Tuning[];
}

/**
 * The A4 pages of a setlist. Heights are measured on an off-screen copy (same fonts and widths as
 * the pages), then `paginateBlocks` decides where each page ends. What you see here is what prints.
 */
export function PrintPages({ tree, songs, performers, tunings }: Props) {
  const lookups = buildLookups(songs, performers, tunings);
  const blocks = sortedBlocks(tree);
  const rowsOf = (blockId: string) =>
    itemsOfBlock(tree, blockId).filter((item) => lookups.songs.has(item.songId));

  const measureRef = useRef<HTMLDivElement>(null);
  const [plan, setPlan] = useState<PageChunk[][] | null>(null);
  const [scale, setScale] = useState(() => scaleFor(window.innerWidth));

  useEffect(() => {
    const onResize = () => setScale(scaleFor(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useLayoutEffect(() => {
    let cancelled = false;
    const measure = () => {
      const root = measureRef.current;
      if (!root || cancelled) return;
      const height = (key: string) =>
        root.querySelector<HTMLElement>(`[data-m="${key}"]`)?.getBoundingClientRect().height ?? 0;
      const pageHeight = height('page');
      if (pageHeight === 0) {
        // No layout engine (tests): everything on a single page.
        setPlan([blocks.map((b) => ({ blockId: b.id, from: 0, to: rowsOf(b.id).length, continued: false }))]);
        return;
      }
      const capacity = pageHeight - height('safety');
      setPlan(
        paginateBlocks({
          pageCapacity: capacity,
          firstPageCapacity: capacity - height('header'),
          blockGap: height('gap'),
          blocks: blocks.map((b) => ({
            id: b.id,
            headingHeight: height(`heading-${b.id}`),
            rowHeights: rowsOf(b.id).map((item) => height(`row-${item.id}`)),
          })),
        }),
      );
    };
    // Measure once the web fonts are in, otherwise heights come from the fallback fonts.
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
    void Promise.resolve(fonts?.ready).then(() => requestAnimationFrame(measure));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, songs, performers, tunings]);

  const pageCount = plan?.length ?? 1;
  const header = <PosterHeader tree={tree} songs={songs} performers={performers} tunings={tunings} />;

  return (
    <>
      <div ref={measureRef} className="pp-measure" aria-hidden>
        <div data-m="page" style={{ height: '271mm' }} /> {/* 297 - 14 - 12 */}
        <div data-m="safety" style={{ height: '2mm' }} />
        <div data-m="gap" style={{ height: '7mm' }} />
        <div data-m="header">{header}</div>
        {blocks.map((block) => (
          <div key={block.id}>
            <div data-m={`heading-${block.id}`}>
              <PosterBlockHeading block={block} />
            </div>
            {rowsOf(block.id).map((item, index) => (
              <div key={item.id} data-m={`row-${item.id}`}>
                <PosterRow item={item} song={lookups.songs.get(item.songId)!} index={index} lookups={lookups} />
              </div>
            ))}
          </div>
        ))}
      </div>

      {plan && (
        <div
          className="pp-viewport"
          style={
            {
              '--pp-k': scale,
              '--pp-h': `calc(${pageCount} * 297mm + ${pageCount + 1} * 12px)`,
            } as React.CSSProperties
          }
        >
          <div className="pp-scale">
            {plan.map((chunks, pageIndex) => (
              <section key={pageIndex} className="pp-page">
                {pageIndex === 0 && header}
                {chunks.map((chunk) => {
                  const block = blocks.find((b) => b.id === chunk.blockId)!;
                  return (
                    <div key={`${chunk.blockId}-${chunk.from}`} className="mt-[7mm]">
                      <PosterBlockHeading block={block} continued={chunk.continued} />
                      {rowsOf(block.id)
                        .slice(chunk.from, chunk.to)
                        .map((item, i) => (
                          <PosterRow
                            key={item.id}
                            item={item}
                            song={lookups.songs.get(item.songId)!}
                            index={chunk.from + i}
                            lookups={lookups}
                          />
                        ))}
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** On screens narrower than an A4 page, scale the pages down to fit (screen only, never in print). */
function scaleFor(viewportWidth: number): number {
  return Math.min(1, (viewportWidth - 16) / PAGE_WIDTH_PX);
}
