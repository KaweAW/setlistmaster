import { itemsOfBlock, sortedBlocks, type SetlistTree } from '../core/setlistOps';
import type { Performer, Song, Tuning } from '../core/types';
import { buildLookups, PosterBlockHeading, PosterHeader, PosterRow } from './setlistParts';

/** Read-only setlist in the "concert poster" style of the prototype (the on-screen twin of the PDF). */
export function SetlistSheet({
  tree,
  songs,
  performers,
  tunings,
}: {
  tree: SetlistTree;
  songs: Song[];
  performers: Performer[];
  tunings: Tuning[];
}) {
  const lookups = buildLookups(songs, performers, tunings);

  return (
    <article className="relative mx-auto my-3 min-h-[60vh] max-w-[210mm] bg-paper py-8 pl-[18mm] pr-[10mm] shadow-[0_4px_20px_rgba(0,0,0,.18)] max-sm:pl-10 max-sm:pr-4">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[6mm] bg-chrome" />
      <span aria-hidden className="absolute inset-y-0 left-[6mm] w-[1.2mm] bg-gradient-to-b from-lei via-coro to-io" />

      <PosterHeader
        tree={tree}
        songs={songs}
        performers={performers}
        tunings={tunings}
        className="max-sm:flex-col max-sm:items-start"
      />

      {sortedBlocks(tree).map((block) => (
        <section key={block.id} className="mt-[7mm]">
          <PosterBlockHeading block={block} />
          {itemsOfBlock(tree, block.id).map((item, index) => {
            const song = lookups.songs.get(item.songId);
            return song ? (
              <PosterRow key={item.id} item={item} song={song} index={index} lookups={lookups} linked />
            ) : null;
          })}
        </section>
      ))}
    </article>
  );
}
