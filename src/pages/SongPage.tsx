import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { SwipeDirection } from '../core/autoscroll';
import { accidentalsForKey, inferKey, transposeKey } from '../core/chords';
import { chartChords, parseChordPro } from '../core/chordpro';
import { effectivePerformerIds, effectiveTuningId } from '../core/legend';
import { itemsOfBlock, sortedBlocks, type SetlistTree } from '../core/setlistOps';
import type { Performer, SetlistItem, Song, Tuning } from '../core/types';
import { formatDuration } from '../core/format';
import { ChordChart } from '../components/ChordChart';
import { PerformerBadge } from '../components/PerformerBadge';
import { StageToggle } from '../components/StageToggle';
import { SongToolbar } from '../components/SongToolbar';
import { TuningChip } from '../components/TuningChip';
import { buildLookups, TransitionLine } from '../components/setlistParts';
import { buttonClass } from '../components/ui';
import { useCanEdit } from '../cloud/CloudProvider';
import { useData } from '../data/DataProvider';
import { loadTree } from '../data/setlistService';
import { useAutoScroll } from '../hooks/useAutoScroll';
import { useQuery } from '../hooks/useQuery';
import { useSwipe } from '../hooks/useSwipe';
import { useWakeLock, type WakeLockStatus } from '../hooks/useWakeLock';
import { useT } from '../i18n';
import { useUiStore } from '../state/uiStore';

// pdf.js is heavy: it is only fetched when a song actually shows its PDF.
const PdfViewer = lazy(() => import('../components/PdfViewer'));

export default function SongPage() {
  const { songId, setlistId, itemId } = useParams();
  // Keyed: moving to another song starts from a clean state (no transposition, scroll stopped).
  return <SongPageInner key={`${setlistId ?? ''}/${itemId ?? songId}`} songId={songId} setlistId={setlistId} itemId={itemId} />;
}

function SongPageInner({ songId, setlistId, itemId }: { songId?: string; setlistId?: string; itemId?: string }) {
  const t = useT();
  const { store, band } = useData();

  const { data, loading } = useQuery(async () => {
    const [songs, performers, tunings] = await Promise.all([
      store.songs.listBy('bandId', band.id),
      store.performers.listBy('bandId', band.id),
      store.tunings.listBy('bandId', band.id),
    ]);
    const tree = setlistId ? await loadTree(store, setlistId) : undefined;
    const item = tree?.items.find((i) => i.id === itemId);
    const song = songs.find((s) => s.id === (item?.songId ?? songId));
    const file = song?.pdfBlobId ? await store.files.get(song.pdfBlobId) : undefined;
    return { songs, performers, tunings, tree, item, song, pdf: file?.data };
  }, [store, band.id, setlistId, itemId, songId]);

  if (loading || !data) return <p className="p-6 text-soft">{t('app.loading')}</p>;
  if (!data.song) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <p className="text-soft">{t('chart.notFound')}</p>
        <Link to={setlistId ? `/setlist/${setlistId}` : '/library'} className={`${buttonClass('secondary')} mt-4`}>
          {t('common.back')}
        </Link>
      </main>
    );
  }
  return <SongView {...data} song={data.song} setlistId={setlistId} />;
}

function SongView({
  song, songs, performers, tunings, tree, item, pdf, setlistId,
}: {
  song: Song;
  songs: Song[];
  performers: Performer[];
  tunings: Tuning[];
  tree: SetlistTree | undefined;
  item: SetlistItem | undefined;
  pdf: ArrayBuffer | undefined;
  setlistId: string | undefined;
}) {
  const t = useT();
  const navigate = useNavigate();
  const canEdit = useCanEdit(useData().band.id);
  // Stage mode has its own, larger text size, so adjusting it on stage never disturbs the everyday one.
  const stage = useUiStore((s) => s.stageMode);
  const fontSize = useUiStore((s) => (s.stageMode ? s.stageFontSize : s.songFontSize));
  const setFontSize = useUiStore((s) => (s.stageMode ? s.setStageFontSize : s.setSongFontSize));
  const scrollLevel = useUiStore((s) => s.scrollLevel);
  const setScrollLevel = useUiStore((s) => s.setScrollLevel);

  const lookups = useMemo(() => buildLookups(songs, performers, tunings), [songs, performers, tunings]);
  const chart = useMemo(() => parseChordPro(song.chordpro), [song.chordpro]);
  const hasChart = song.chordpro.trim() !== '';
  const [mode, setMode] = useState<'chords' | 'pdf'>(hasChart || !pdf ? 'chords' : 'pdf');
  const [semitones, setSemitones] = useState(0);
  const [capo, setCapo] = useState(song.capo);
  const [playing, setPlaying] = useState(false);

  // The chords in the chart are the shapes played with the capo saved on the song. Moving the capo changes the
  // shapes (not the sound); transposing changes the sound. `shift` is what is applied to the written chords.
  const shift = semitones - (capo - song.capo);
  const baseKey = song.key?.trim() || chart.key || inferKey(chartChords(chart));
  const accidentals = accidentalsForKey(baseKey, shift);
  const shownKey = baseKey ? transposeKey(baseKey, shift) : undefined;

  // Order of the songs in the setlist we came from, for previous / next.
  const order = useMemo(
    () =>
      tree
        ? sortedBlocks(tree).flatMap((b) => itemsOfBlock(tree, b.id)).filter((i) => lookups.songs.has(i.songId))
        : [],
    [tree, lookups],
  );
  const position = item ? order.findIndex((i) => i.id === item.id) : -1;
  const previous = position > 0 ? order[position - 1] : undefined;
  const next = position >= 0 ? order[position + 1] : undefined;
  const go = useCallback(
    (target: { id: string } | undefined) => {
      if (target && setlistId) navigate(`/setlist/${setlistId}/song/${target.id}`, { replace: true });
    },
    [navigate, setlistId],
  );
  const onSwipe = (direction: SwipeDirection) => go(direction === 'next' ? next : previous);
  const swipe = useSwipe(onSwipe, mode === 'chords');

  const stop = useCallback(() => setPlaying(false), []);
  useAutoScroll(playing, scrollLevel, stop);
  // Never let the screen sleep on stage, nor while the page is scrolling by itself.
  const wake = useWakeLock(stage || playing);

  // Block body on purpose: recent Chrome returns a Promise from scrollTo, and an effect must not return one.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes((e.target as HTMLElement).tagName)) return;
      if (e.key === 'ArrowLeft') go(previous);
      else if (e.key === 'ArrowRight') go(next);
      else if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, previous, next]);

  const performerIds = item ? effectivePerformerIds(item, song) : song.defaultPerformerIds;
  const tuningId = item ? effectiveTuningId(item, song) : song.tuningId;
  const tuning = tuningId ? lookups.tunings.get(tuningId) : undefined;
  const nextSong = next ? lookups.songs.get(next.songId) : undefined;
  const facts = [
    shownKey && `${t('chart.key')} ${shownKey}`,
    capo > 0 && `${t('chart.capo')} ${capo}`,
    song.tempo && `${song.tempo} BPM`,
    song.durationSec && formatDuration(song.durationSec),
  ].filter(Boolean);

  const iconButton =
    'grid h-11 w-11 shrink-0 place-items-center rounded-md bg-white/10 text-xl hover:bg-white/20 aria-disabled:opacity-30';

  return (
    <div className="min-h-screen bg-paper">
      <header
        className="sticky top-0 z-20 bg-chrome text-chrome-ink"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2">
          <Link to={setlistId ? `/setlist/${setlistId}` : '/library'} aria-label={t('common.back')} className={iconButton}>←</Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-xl font-bold uppercase leading-tight tracking-wide">{song.title}</h1>
            <p className="truncate text-xs text-chrome-ink/70">
              {[song.artist, position >= 0 && t('chart.position', { n: position + 1, total: order.length })]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          {setlistId && (
            <>
              <button type="button" aria-label={t('chart.previous')} disabled={!previous} onClick={() => go(previous)} className={`${iconButton} disabled:opacity-30`}>‹</button>
              <button type="button" aria-label={t('chart.next')} disabled={!next} onClick={() => go(next)} className={`${iconButton} disabled:opacity-30`}>›</button>
            </>
          )}
          {!stage && canEdit && (
            <Link to={`/library/${song.id}`} className="inline-flex h-11 items-center rounded-md bg-white/10 px-3 text-sm font-semibold hover:bg-white/20">
              {t('common.edit')}
            </Link>
          )}
        </div>
      </header>

      <main
        {...swipe}
        className="mx-auto max-w-3xl touch-pan-y touch-pinch-zoom px-4 pt-3"
        style={{ paddingBottom: '12rem' }}
      >
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {facts.length > 0 && <span className="text-sm font-semibold text-soft">{facts.join(' · ')}</span>}
          {tuning && !tuning.isStandard && <TuningChip tuning={tuning} />}
          <span className="flex items-center gap-1">
            {performerIds.map((id) => {
              const p = lookups.performers.get(id);
              return p ? <PerformerBadge key={id} performer={p} /> : null;
            })}
            {item?.performerNote && <span className="ml-1 text-[11px] italic text-soft">{item.performerNote}</span>}
          </span>
          {hasChart && pdf && (
            <span role="group" className="ml-auto inline-flex overflow-hidden rounded-md border border-line">
              {(['chords', 'pdf'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={`h-11 px-4 text-sm font-semibold ${mode === m ? 'bg-ink text-paper' : 'bg-surface text-ink'}`}
                >
                  {t(m === 'chords' ? 'chart.chords' : 'chart.pdf')}
                </button>
              ))}
            </span>
          )}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-3">
          <StageToggle />
          {stage && <WakeBadge status={wake} />}
        </div>

        {[song.notes, item?.notes].filter(Boolean).map((note, i) => (
          <p key={i} className="mb-2 whitespace-pre-wrap text-sm italic text-soft">{note}</p>
        ))}

        {mode === 'chords' && hasChart && (
          <ChordChart chart={chart} semitones={shift} accidentals={accidentals} fontSize={fontSize} />
        )}
        {mode === 'pdf' && pdf && (
          <Suspense fallback={<p className="py-6 text-center text-soft">{t('chart.loadingPdf')}</p>}>
            <PdfViewer data={pdf} />
          </Suspense>
        )}
        {!hasChart && !pdf && (
          <div className="py-12 text-center">
            <p className="mb-4 text-soft">{t('chart.empty')}</p>
            <Link to={`/library/${song.id}`} className={buttonClass('primary')}>{t('chart.emptyAction')}</Link>
          </div>
        )}

        {item && <TransitionLine item={item} className="mt-8" />}
        {nextSong && next && (
          <Link
            to={`/setlist/${setlistId}/song/${next.id}`}
            replace
            className={`${buttonClass('secondary')} mt-4 w-full justify-between`}
          >
            <span className="truncate">{t('chart.nextUp', { title: nextSong.title })}</span>
            <span aria-hidden>→</span>
          </Link>
        )}
      </main>

      <SongToolbar
        showChartControls={mode === 'chords' && hasChart}
        semitones={semitones}
        onSemitones={setSemitones}
        capo={capo}
        onCapo={(n) => setCapo(Math.min(12, Math.max(0, n)))}
        fontSize={fontSize}
        onFontSize={setFontSize}
        playing={playing}
        onTogglePlay={() => setPlaying((p) => !p)}
        scrollLevel={scrollLevel}
        onScrollLevel={setScrollLevel}
      />
    </div>
  );
}

/** Tells the player whether the screen is really being kept on: on stage a dark screen is the worst surprise. */
function WakeBadge({ status }: { status: WakeLockStatus }) {
  const t = useT();
  const ok = status === 'active';
  const problem = status === 'denied' || status === 'unsupported';
  if (status === 'inactive') return null;
  return (
    <span role="status" className={`text-sm font-semibold ${problem ? 'text-lei' : ok ? 'text-io' : 'text-soft'}`}>
      {problem ? `⚠ ${t('wake.unavailable')}` : ok ? `☀ ${t('wake.active')}` : t('wake.pending')}
    </span>
  );
}
