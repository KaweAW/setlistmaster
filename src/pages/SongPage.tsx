import { Select } from '../components/Select';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { SwipeDirection } from '../core/autoscroll';
import { accidentalsForKey, inferKey, transposeKey } from '../core/chords';
import { chartChords, chartSections, parseChordPro } from '../core/chordpro';
import { effectivePerformerIds, effectiveTuningId } from '../core/legend';
import { itemsOfBlock, sortedBlocks, type SetlistTree } from '../core/setlistOps';
import type { Attachment, Instrument, Part, Performer, SetlistItem, Song, Tuning } from '../core/types';
import { formatDuration } from '../core/format';
import { ChordChart } from '../components/ChordChart';
import { MetronomePanel } from '../components/MetronomePanel';
import { PerformerBadge } from '../components/PerformerBadge';
import { Segmented } from '../components/Segmented';
import { StageToggle } from '../components/StageToggle';
import { SongToolbar } from '../components/SongToolbar';
import { TuningChip } from '../components/TuningChip';
import { buildLookups, TransitionLine } from '../components/setlistParts';
import { buttonClass } from '../components/ui';
import { useCanEdit, useCloud } from '../cloud/CloudProvider';
import { songAttachments } from '../data/attachments';
import { useData } from '../data/DataProvider';
import { loadTree } from '../data/setlistService';
import { useAutoScroll } from '../hooks/useAutoScroll';
import { useScrollProgress } from '../hooks/useScrollProgress';
import { useQuery } from '../hooks/useQuery';
import { useSwipe } from '../hooks/useSwipe';
import { useWakeLock, type WakeLockStatus } from '../hooks/useWakeLock';
import { useT } from '../i18n';
import { clearSongSlide, peekSongSlide, rememberSongSlide } from '../state/songSlide';
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
    const [songs, performers, tunings, instruments, parts] = await Promise.all([
      store.songs.listBy('bandId', band.id),
      store.performers.listBy('bandId', band.id),
      store.tunings.listBy('bandId', band.id),
      store.instruments.listBy('bandId', band.id),
      store.parts.listBy('bandId', band.id),
    ]);
    const tree = setlistId ? await loadTree(store, setlistId) : undefined;
    const item = tree?.items.find((i) => i.id === itemId);
    const song = songs.find((s) => s.id === (item?.songId ?? songId));
    const pdfs = song ? await songAttachments(store, song.id) : [];
    return { songs, performers, tunings, instruments, parts, tree, item, song, pdfs };
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

const chipBase = 'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold';
const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const ICONS = {
  key: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  capo: 'M4 9h16M4 15h16M9 4v16',
  beat: 'M3 12h4l2-6 4 12 2-6h6',
  time: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
};

/** A fact about the song as a pill; it is a button when it leads somewhere (the key opens the transposer, the tempo the metronome). */
function Chip({ icon, children, onClick, pressed, label }: { icon: keyof typeof ICONS; children: string; onClick?: (() => void) | undefined; pressed?: boolean; label?: string }) {
  const tone = 'border-line bg-surface text-ink';
  const content = (
    <>
      <span className="text-io"><Icon d={ICONS[icon]} /></span>
      {children}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} {...(pressed !== undefined ? { 'aria-pressed': pressed } : {})} {...(label ? { 'aria-label': label } : {})} data-keep-controls={pressed !== undefined ? '' : undefined} className={`${chipBase} ${pressed ? 'border-ink bg-ink text-paper [&>span]:text-paper' : tone} transition-colors hover:border-io/60 active:scale-[0.97]`}>
      {content}
    </button>
  ) : (
    <span className={`${chipBase} ${tone}`}>{content}</span>
  );
}

/** Jump chips for the sections of a long sheet, in the header; the one being read is highlighted and kept in view. */
function SectionNav({ items, current }: { items: { index: number; label: string; kind: string }[]; current: number }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bar.current?.querySelector('[aria-current="true"]')?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [current]);
  return (
    <nav aria-label="Sections" ref={bar} className="mx-auto flex max-w-3xl gap-1.5 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
      {items.map((x) => (
        <button
          key={x.index}
          type="button"
          data-kind={x.kind}
          aria-current={current === x.index}
          onClick={() => document.getElementById(`sec-${x.index}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })}
          className="song-sec-chip h-8 shrink-0 rounded-full px-3 text-xs font-semibold uppercase tracking-wide transition-colors"
        >
          {x.label}
        </button>
      ))}
    </nav>
  );
}

function SongView({
  song, songs, performers, tunings, instruments, parts, tree, item, pdfs, setlistId,
}: {
  song: Song;
  songs: Song[];
  performers: Performer[];
  tunings: Tuning[];
  instruments: Instrument[];
  parts: Part[];
  tree: SetlistTree | undefined;
  item: SetlistItem | undefined;
  pdfs: Attachment[];
  setlistId: string | undefined;
}) {
  const t = useT();
  const navigate = useNavigate();
  const canEdit = useCanEdit(useData().band.id);
  // Stage mode has its own, larger text size, so adjusting it on stage never disturbs the everyday one.
  const stage = useUiStore((s) => s.stageMode);
  const [metro, setMetro] = useState(false);
  const fontSize = useUiStore((s) => (s.stageMode ? s.stageFontSize : s.songFontSize));
  const setFontSize = useUiStore((s) => (s.stageMode ? s.setStageFontSize : s.setSongFontSize));
  const scrollLevel = useUiStore((s) => s.scrollLevel);
  const setScrollLevel = useUiStore((s) => s.setScrollLevel);

  const lookups = useMemo(() => buildLookups(songs, performers, tunings), [songs, performers, tunings]);
  // Tabs: the plain text is always there; each instrument of the song with a part adds one. Opens on my instrument.
  const myInstrumentId = useUiStore((s) => s.myInstruments[song.bandId]);
  const tabs = useMemo(
    () =>
      [...instruments]
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
        .filter((i) => song.instrumentIds.includes(i.id))
        .map((i) => ({ instrument: i, part: parts.find((p) => p.songId === song.id && p.instrumentId === i.id) }))
        .filter((x) => (x.part?.chordpro.trim() ?? '') !== '' || pdfs.some((f) => f.instrumentId === x.instrument.id)),
    [instruments, parts, song, pdfs],
  );
  const [tab, setTab] = useState<string>(() => (tabs.some((x) => x.instrument.id === myInstrumentId) ? myInstrumentId! : 'text'));
  const activeTab = tabs.find((x) => x.instrument.id === tab);
  const onText = activeTab === undefined;
  const activeText = activeTab ? (activeTab.part?.chordpro ?? '') : song.chordpro;
  const chart = useMemo(() => parseChordPro(activeText), [activeText]);
  const hasChart = activeText.trim() !== '';
  // PDFs of the open tab (the text's have no instrument). Mode and chosen PDF are remembered per tab.
  const tabPdfs = useMemo(() => pdfs.filter((f) => (onText ? f.instrumentId === undefined : f.instrumentId === tab)), [pdfs, onText, tab]);
  const [modes, setModes] = useState<Record<string, 'chords' | 'pdf'>>({});
  const [pdfChoice, setPdfChoice] = useState<Record<string, string>>({});
  const mode = modes[tab] ?? (hasChart || tabPdfs.length === 0 ? 'chords' : 'pdf');
  const setMode = (m: 'chords' | 'pdf') => setModes((x) => ({ ...x, [tab]: m }));
  const pdf = tabPdfs.find((f) => f.id === pdfChoice[tab]) ?? tabPdfs[0];
  const [semitones, setSemitones] = useState(0);
  const [capo, setCapo] = useState(song.capo);
  const [playing, setPlaying] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [currentSection, setCurrentSection] = useState(0);
  const page = useRef<HTMLDivElement>(null);
  useScrollProgress(page);
  const slideFrom = peekSongSlide();
  useEffect(() => clearSongSlide(), []);

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
      if (target && setlistId) {
        rememberSongSlide(target === next ? 'right' : 'left'); // the new song comes in from the side it is on
        navigate(`/setlist/${setlistId}/song/${target.id}`, { replace: true });
      }
    },
    [navigate, setlistId, next],
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

  const sectionItems = useMemo(
    () =>
      chartSections(chart)
        .filter((x) => x.lines[0]?.kind === 'label')
        .map((x) => {
          const fallback = { intro: 'chart.intro', verse: 'chart.verse', prechorus: 'chart.prechorus', chorus: 'chart.chorus', bridge: 'chart.bridge', instrumental: 'chart.instrumental', outro: 'chart.outro', tab: 'chart.tab' } as const;
          const key = x.section.kind === 'none' ? undefined : fallback[x.section.kind];
          return { index: x.section.index, kind: x.section.kind, label: (x.section.text || (key ? t(key) : '')).replace(/:.*$/, '') };
        })
        .filter((x) => x.label !== ''),
    [chart, t],
  );
  const performerIds = item ? effectivePerformerIds(item, song) : song.defaultPerformerIds;
  const tuningId = item ? effectiveTuningId(item, song) : song.tuningId;
  const tuning = tuningId ? lookups.tunings.get(tuningId) : undefined;
  const nextSong = next ? lookups.songs.get(next.songId) : undefined;


  const iconButton =
    'grid h-11 w-11 shrink-0 place-items-center rounded-md bg-white/10 text-xl hover:bg-white/20 aria-disabled:opacity-30';

  return (
    <div ref={page} className={`min-h-screen bg-paper ${slideFrom ? `band-in-${slideFrom}` : 'motion-safe:animate-fade-in'}`}>
      <header
        className="song-header sticky top-0 z-20 bg-chrome text-chrome-ink"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2">
          <Link to={setlistId ? `/setlist/${setlistId}` : '/library'} aria-label={t('common.back')} className={iconButton}>←</Link>
          <div className="min-w-0 flex-1">
            <h1 data-vt-to="song-title" className="song-title truncate font-display text-2xl font-bold uppercase leading-tight tracking-wide">{song.title}</h1>
            <p className="song-sub truncate text-xs text-chrome-ink/70">
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
        {mode === 'chords' && hasChart && sectionItems.length >= 3 && <SectionNav items={sectionItems} current={currentSection} />}
        <span aria-hidden className="song-progress" />
      </header>

      <main
        {...swipe}
        className="mx-auto max-w-3xl touch-pan-y touch-pinch-zoom px-4 pt-4"
        style={{ paddingBottom: '12rem' }}
      >
        {(shownKey || capo > 0 || song.tempo || song.durationSec || (tuning && !tuning.isStandard) || performerIds.length > 0) && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {shownKey && <Chip icon="key" pressed={hasChart && mode === 'chords' ? controlsOpen : undefined} onClick={hasChart && mode === 'chords' ? () => setControlsOpen(!controlsOpen) : undefined}>{`${t('chart.key')} ${shownKey}`}</Chip>}
            {capo > 0 && <Chip icon="capo">{`${t('chart.capo')} ${capo}`}</Chip>}
            {song.tempo ? (
              <Chip icon="beat" pressed={metro} label={t('metro.title')} onClick={() => setMetro(!metro)}>{`♩ ${song.tempo}`}</Chip>
            ) : null}
            {song.durationSec ? <Chip icon="time">{formatDuration(song.durationSec)}</Chip> : null}
            {tuning && !tuning.isStandard && <TuningChip tuning={tuning} />}
            {performerIds.map((id) => {
              const p = lookups.performers.get(id);
              return p ? (
                <span key={id} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface pl-1 pr-3 text-sm font-semibold" style={{ borderColor: `${p.color}66` }}>
                  <PerformerBadge performer={p} size={22} />
                  {p.name}
                </span>
              ) : null;
            })}
          </div>
        )}

        {/* Stage mode, the metronome (when the song has no tempo) and which part to read, joined in one bar. */}
        <div className="mb-3 flex items-center gap-2">
          <StageToggle />
          {!song.tempo && (
            <button
              type="button"
              aria-pressed={metro}
              aria-label={t('metro.title')}
              onClick={() => setMetro(!metro)}
              className={`h-11 shrink-0 rounded-md border border-line px-3 text-sm font-semibold transition-colors ${metro ? 'bg-chrome text-chrome-ink' : 'bg-surface'}`}
            >
              ♩
            </button>
          )}
          {tabs.length > 0 && (
            <Select
              label={t('part.select')}
              variant="compact"
              className="min-w-0 flex-1"
              value={onText ? 'text' : tab}
              onChange={setTab}
              options={[{ value: 'text', label: t('part.text') }, ...tabs.map((x) => ({ value: x.instrument.id, label: x.instrument.name }))]}
            />
          )}
          {hasChart && pdf && (
            <Segmented
              className="ml-auto shrink-0"
              value={mode}
              onChange={setMode}
              options={[{ value: 'chords', label: t('chart.chords') }, { value: 'pdf', label: t('chart.pdf') }]}
            />
          )}
        </div>
        {metro && <MetronomePanel key={song.id} initialBpm={song.tempo} />}
        {(item?.performerNote || stage) && (
          <div className="mb-3 flex flex-wrap items-center gap-3">
            {item?.performerNote && <span className="text-[11px] italic text-soft">{item.performerNote}</span>}
            {stage && <WakeBadge status={wake} />}
          </div>
        )}

        {[song.notes, item?.notes].filter(Boolean).map((note, i) => (
          <p key={i} className="mb-2 whitespace-pre-wrap text-sm italic text-soft">{note}</p>
        ))}

        {mode === 'chords' && hasChart && (
          <ChordChart chart={chart} semitones={shift} accidentals={accidentals} fontSize={fontSize} stage={stage} onCurrentSection={setCurrentSection} />
        )}
        {mode === 'pdf' && pdf && tabPdfs.length > 1 && (
          <Select
            label={t('part.pdfSelect')}
            variant="compact"
            className="mb-3 w-full"
            value={pdf.id}
            onChange={(v) => setPdfChoice((x) => ({ ...x, [tab]: v }))}
            options={tabPdfs.map((f) => ({ value: f.id, label: f.name }))}
          />
        )}
        {mode === 'pdf' && pdf && (
          <Suspense fallback={<p className="py-6 text-center text-soft">{t('chart.loadingPdf')}</p>}>
            <PdfBody key={pdf.id} id={pdf.id} />
          </Suspense>
        )}
        {!hasChart && !pdf && (
          <div className="flex flex-col items-center py-12 text-center">
            <svg viewBox="0 0 120 64" width="168" height="90" aria-hidden className="mb-5 text-io">
              {[10, 22, 34, 46, 58].map((y, i) => (
                <line key={y} x1="4" x2="116" y1={y} y2={y} stroke="currentColor" strokeWidth="1.5" opacity="0.35" className="staff-line" style={{ animationDelay: `${i * 90}ms` }} />
              ))}
              <g fill="currentColor" className="staff-note">
                <ellipse cx="38" cy="46" rx="6.5" ry="4.8" transform="rotate(-18 38 46)" /><path d="M43.8 44.5V16" stroke="currentColor" strokeWidth="2" />
                <ellipse cx="70" cy="34" rx="6.5" ry="4.8" transform="rotate(-18 70 34)" /><path d="M75.8 32.5V8" stroke="currentColor" strokeWidth="2" />
                <ellipse cx="98" cy="22" rx="6.5" ry="4.8" transform="rotate(-18 98 22)" opacity="0.6" />
              </g>
            </svg>
            <p className="mb-4 text-soft">{t('chart.empty')}</p>
            {canEdit && <Link to={`/library/${song.id}`} className={buttonClass('primary')}>{t('chart.emptyAction')}</Link>}
          </div>
        )}

        {item && <TransitionLine item={item} className="mt-8" />}
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
        stage={stage}
        controlsOpen={controlsOpen}
        onControlsOpen={setControlsOpen}
        onNext={() => rememberSongSlide('right')}
        {...(nextSong && next ? { next: { title: nextSong.title, to: `/setlist/${setlistId}/song/${next.id}` } } : {})}
      />
    </div>
  );
}

/** One PDF: its bytes are read from this device; if a bandmate added it and it has not arrived yet, say so and offer to fetch it. */
function PdfBody({ id }: { id: string }) {
  const t = useT();
  const { store, band } = useData();
  const { configured, syncNow } = useCloud();
  const { data, loading, reload } = useQuery(async () => (await store.files.get(id))?.data ?? null, [store, id]);
  const [fetching, setFetching] = useState(false);
  if (loading) return <p className="py-6 text-center text-soft">{t('chart.loadingPdf')}</p>;
  if (data) {
    return (
      <Suspense fallback={<p className="py-6 text-center text-soft">{t('chart.loadingPdf')}</p>}>
        <PdfViewer data={data} />
      </Suspense>
    );
  }
  return (
    <div className="py-8 text-center">
      <p className="mb-3 text-soft">{t('chart.pdfMissing')}</p>
      {configured && (
        <button
          type="button"
          disabled={fetching}
          className={buttonClass('secondary')}
          onClick={() => {
            setFetching(true);
            void syncNow(band.id).finally(() => {
              setFetching(false);
              reload();
            });
          }}
        >
          {fetching ? t('chart.pdfFetching') : t('chart.pdfFetch')}
        </button>
      )}
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
