import { Link } from 'react-router-dom';
import { splitEmphasis } from '../core/emphasis';
import { formatDate, formatTotalDuration } from '../core/format';
import { computeLegend, effectivePerformerIds, effectiveTuningId, type Legend as LegendData } from '../core/legend';
import type { SetlistTree } from '../core/setlistOps';
import { setlistStats } from '../core/stats';
import type { Block, Performer, SetlistItem, Song, Tuning } from '../core/types';
import { useT } from '../i18n';
import { useUiStore } from '../state/uiStore';
import { PerformerBadge } from './PerformerBadge';
import { TuningChip } from './TuningChip';

export interface Lookups {
  songs: Map<string, Song>;
  performers: Map<string, Performer>;
  tunings: Map<string, Tuning>;
}

export function buildLookups(songs: Song[], performers: Performer[], tunings: Tuning[]): Lookups {
  return {
    songs: new Map(songs.map((s) => [s.id, s])),
    performers: new Map(performers.map((p) => [p.id, p])),
    tunings: new Map(tunings.map((x) => [x.id, x])),
  };
}

/** Right-hand side of a song row: singer note, tuning (only when not standard) and singer badges. */
export function ItemBadges({
  item,
  song,
  lookups,
  className = 'justify-end',
}: {
  item: SetlistItem;
  song: Song;
  lookups: Lookups;
  className?: string;
}) {
  const tuningId = effectiveTuningId(item, song);
  const tuning = tuningId ? lookups.tunings.get(tuningId) : undefined;
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {item.performerNote && <span className="mr-1 text-[11px] italic text-soft">{item.performerNote}</span>}
      {tuning && !tuning.isStandard && (
        <span className="mr-1">
          <TuningChip tuning={tuning} />
        </span>
      )}
      {effectivePerformerIds(item, song).map((id) => {
        const performer = lookups.performers.get(id);
        return performer ? <PerformerBadge key={id} performer={performer} /> : null;
      })}
    </div>
  );
}

/** "↳ text" / "■ text" line under a song. Renders nothing when there is no transition. */
export function TransitionLine({ item, className = '' }: { item: SetlistItem; className?: string }) {
  if (item.transitionType === 'none') return null;
  return (
    <p
      className={`border-l-2 pl-3.5 text-xs leading-snug text-soft ${
        item.transitionType === 'stop' ? 'border-ink' : 'border-line'
      } ${className}`}
    >
      {item.transitionType === 'stop' ? '■' : '↳'}{' '}
      {splitEmphasis(item.transitionText).map((run, k) =>
        run.bold ? (
          <b key={k} className="font-semibold text-ink">{run.text}</b>
        ) : (
          <span key={k}>{run.text}</span>
        ),
      )}
    </p>
  );
}

/** The legend, drawn from computeLegend(): only what the setlist actually uses. */
export function Legend({ legend }: { legend: LegendData }) {
  const t = useT();
  const cell = 'flex items-center gap-1.5 whitespace-nowrap';
  return (
    <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-[11.5px] text-soft">
      {legend.performers.map((p) => (
        <span key={p.id} className={cell}>
          <PerformerBadge performer={p} size={17} /> {p.name}
        </span>
      ))}
      {legend.tuning && (
        <span className={cell}>
          <i className="grid h-[17px] w-[17px] place-items-center rounded-[3px] bg-acc text-[11px] not-italic leading-none text-white">♭</i>
          {t('tuning.different')}
        </span>
      )}
      {legend.segue && <span className={cell}>↳ {t('transition.segue')}</span>}
      {legend.stop && <span className={cell}>■ {t('transition.stop')}</span>}
    </div>
  );
}

/** Poster header: big title, summary line and the computed legend. Same markup on screen and in the PDF. */
export function PosterHeader({
  tree,
  songs,
  performers,
  tunings,
  className = '',
}: {
  tree: SetlistTree;
  songs: Song[];
  performers: Performer[];
  tunings: Tuning[];
  className?: string;
}) {
  const t = useT();
  const language = useUiStore((s) => s.language);
  const { setlist } = tree;
  const stats = setlistStats(tree.items, songs);
  const legend = computeLegend(tree.items, songs, performers, tunings);
  const duration =
    stats.durationSec > 0
      ? stats.missingDurationCount > 0
        ? t('setlist.durationPartial', { d: formatTotalDuration(stats.durationSec) })
        : formatTotalDuration(stats.durationSec)
      : null;
  const info = [setlist.date && formatDate(setlist.date, language), setlist.venue].filter(Boolean).join(' · ');
  const summary = [t('setlist.summary', { blocks: tree.blocks.length, songs: stats.songCount }), duration, info]
    .filter(Boolean)
    .join(' · ');

  return (
    <header className={`flex items-end justify-between gap-4 border-b-2 border-ink pb-[5mm] ${className}`}>
      <div>
        <h1 className="font-display text-[46px] font-bold uppercase leading-[0.95] tracking-[0.01em]">{setlist.title}</h1>
        <p className="mt-1.5 text-[13px] text-soft">{summary}</p>
      </div>
      <Legend legend={legend} />
    </header>
  );
}

/** Block title with its rule. Padding (not margin) below, so measured heights include the spacing. */
export function PosterBlockHeading({ block, continued = false }: { block: Block; continued?: boolean }) {
  const t = useT();
  return (
    <h2 className="flex items-baseline gap-2.5 pb-[2mm] font-display text-[21px] font-bold uppercase tracking-[0.04em] after:h-px after:flex-1 after:self-center after:bg-line after:content-['']">
      {block.name}
      {continued ? (
        <small className="font-sans text-[13px] font-normal normal-case italic tracking-normal text-soft">
          {t('print.continued')}
        </small>
      ) : (
        block.subtitle && (
          <small className="font-sans text-[13px] font-normal normal-case italic tracking-normal text-soft">
            {block.subtitle}
          </small>
        )
      )}
    </h2>
  );
}

/** One song: number, title and artist, badges, transition. `linked` makes the title open the song. */
export function PosterRow({
  item,
  song,
  index,
  lookups,
  linked = false,
}: {
  item: SetlistItem;
  song: Song;
  index: number;
  lookups: Lookups;
  linked?: boolean;
}) {
  const label = (
    <>
      {song.title}
      {song.artist && <span className="text-[12.5px] font-normal text-soft"> · {song.artist}</span>}
    </>
  );
  const titleClass = 'text-[16.5px] font-semibold leading-[1.2]';
  return (
    <div data-row className="grid grid-cols-[9mm_1fr_auto] gap-x-[3mm] pt-[2.4mm] [break-inside:avoid]">
      <div className="pt-px text-right font-display text-2xl font-bold leading-none text-line">{index + 1}</div>
      {linked ? (
        <Link to={`/setlist/${item.setlistId}/song/${item.id}`} className={`${titleClass} min-h-[28px]`}>{label}</Link>
      ) : (
        <div className={titleClass}>{label}</div>
      )}
      <ItemBadges item={item} song={song} lookups={lookups} />
      <TransitionLine item={item} className="col-span-2 col-start-2 mt-[1.2mm]" />
    </div>
  );
}
