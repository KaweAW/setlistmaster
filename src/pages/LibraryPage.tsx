import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Highlight } from '../components/Highlight';
import { PerformerBadge } from '../components/PerformerBadge';
import { RemoteFlash } from '../components/RemoteFlash';
import { Select } from '../components/Select';
import { CopySongDialog } from '../components/CopySetlistDialog';
import { SongPeek } from '../components/SongPeek';
import { TuningChip } from '../components/TuningChip';
import { buttonClass, PageTitle } from '../components/ui';
import { useCanEdit } from '../cloud/CloudProvider';
import { formatDuration } from '../core/format';
import { collectTags, EMPTY_FILTERS, filterSongs, normalizeText, sortSongs, type SongSort } from '../core/songFilter';
import type { Song } from '../core/types';
import { songAttachments, removeAttachment } from '../data/attachments';
import { useData } from '../data/DataProvider';
import { useHomeMotion } from '../hooks/useHomeMotion';
import { useQuery } from '../hooks/useQuery';
import { useT } from '../i18n';

const letterOf = (text: string): string => {
  const c = text.trim().normalize('NFD').replace(/\p{M}/gu, '').charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
};

function Spark() {
  return (
    <div aria-hidden className="lib-bars flex h-9 items-end justify-center gap-1">
      <i /><i /><i /><i />
    </div>
  );
}

/** The side strip of letters (phones): touch or drag along it to jump through the list. */
function LetterRail({ letters, onJump }: { letters: string[]; onJump: (letter: string) => void }) {
  const [on, setOn] = useState<string | null>(null);
  const rail = useRef<HTMLDivElement>(null);
  const pick = (e: ReactPointerEvent) => {
    const box = rail.current?.getBoundingClientRect();
    if (!box) return;
    const i = Math.min(letters.length - 1, Math.max(0, Math.floor(((e.clientY - box.top) / box.height) * letters.length)));
    const letter = letters[i]!;
    setOn(letter);
    onJump(letter);
  };
  return createPortal(
    <>
      <div
        ref={rail}
        role="navigation"
        aria-label="A–Z"
        className="lib-rail fixed right-0.5 top-1/2 z-20 flex -translate-y-1/2 touch-none select-none flex-col items-center rounded-full bg-surface/70 py-1 text-[10px] font-bold text-soft shadow-sm backdrop-blur sm:hidden"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e); }}
        onPointerMove={(e) => e.buttons > 0 && pick(e)}
        onPointerUp={() => setOn(null)}
        onPointerCancel={() => setOn(null)}
      >
        {letters.map((l) => (
          <button key={l} type="button" tabIndex={-1} aria-hidden {...(on === l ? { 'data-on': '' } : {})} className="grid h-[17px] w-6 place-items-center">{l}</button>
        ))}
      </div>
      {on && (
        <div aria-hidden className="lib-bubble pointer-events-none fixed right-12 top-1/2 z-20 grid h-16 w-16 place-items-center rounded-2xl bg-ink font-display text-4xl font-bold text-paper shadow-xl">
          {on}
        </div>
      )}
    </>,
    document.body,
  );
}

export default function LibraryPage() {
  const t = useT();
  const { store, band } = useData();
  const canEdit = useCanEdit(band.id);
  const root = useRef<HTMLElement>(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState<SongSort>('title');
  const [menu, setMenu] = useState<Song | null>(null);
  const [copying, setCopying] = useState<Song | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const press = useRef({ timer: 0, fired: false, x: 0, y: 0 });
  const { data, loading, reload } = useQuery(async () => {
    const [songs, performers, tunings] = await Promise.all([
      store.songs.listBy('bandId', band.id),
      store.performers.listBy('bandId', band.id),
      store.tunings.listBy('bandId', band.id),
    ]);
    return { songs, performers, tunings };
  }, [store, band.id]);

  const visible = useMemo(() => (data ? sortSongs(filterSongs(data.songs, filters), sort) : []), [data, filters, sort]);
  const tags = useMemo(() => (data ? collectTags(data.songs) : []), [data]);
  const grouped = sort !== 'recent';
  const groups = useMemo(() => {
    if (!grouped) return [{ letter: '', songs: visible }];
    const by = new Map<string, Song[]>();
    for (const s of visible) {
      const l = letterOf(sort === 'artist' ? s.artist || s.title : s.title);
      by.set(l, [...(by.get(l) ?? []), s]);
    }
    return [...by].map(([letter, songs]) => ({ letter, songs }));
  }, [visible, grouped, sort]);

  useHomeMotion(root, visible.map((s) => s.id).join(), !loading && !!data);
  useEffect(() => () => clearTimeout(press.current.timer), []);

  if (loading || !data) return <p className="p-6 text-soft">{t('app.loading')}</p>;

  const performers = new Map(data.performers.map((p) => [p.id, p]));
  const tunings = new Map(data.tunings.map((x) => [x.id, x]));
  const set = (patch: Partial<typeof filters>) => setFilters((f) => ({ ...f, ...patch }));
  const terms = normalizeText(filters.query).split(/\s+/).filter(Boolean);
  const activeCount = [filters.tag, filters.tuningId, filters.performerId].filter(Boolean).length + (terms.length > 0 ? 1 : 0);

  const startPress = (song: Song) => (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse') return;
    press.current.fired = false;
    press.current.x = e.clientX;
    press.current.y = e.clientY;
    clearTimeout(press.current.timer);
    press.current.timer = +setTimeout(() => {
      press.current.fired = true;
      navigator.vibrate?.(12);
      setMenu(song);
    }, 480);
  };
  const endPress = () => clearTimeout(press.current.timer);
  // A finger that drifts is scrolling, not holding.
  const movePress = (e: ReactPointerEvent) => {
    if (Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 10) endPress();
  };

  async function remove(song: Song) {
    setMenu(null);
    const used = await store.items.listBy('songId', song.id);
    if (used.length > 0) return setNotice(t('song.deleteBlocked', { n: used.length }));
    if (!window.confirm(t('common.deleteConfirm', { name: song.title }))) return;
    for (const a of await songAttachments(store, song.id)) await removeAttachment(store, a.id);
    await store.songs.remove(song.id);
    setNotice(null);
    reload();
  }

  const jump = (letter: string) => document.getElementById(`lib-${letter === '#' ? 'num' : letter}`)?.scrollIntoView?.({ block: 'start' });

  return (
    <main ref={root} className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <PageTitle>{t('library.title')}</PageTitle>
          <p aria-hidden className="mt-2 flex items-baseline gap-2 text-soft">
            
            <span key={visible.length} className="font-display text-4xl font-bold leading-none tabular-nums text-ink motion-safe:animate-rise-in">{visible.length}</span>
            <span className="text-sm font-semibold uppercase tracking-wider">
              {visible.length === 1 ? t('library.count.label.one') : t('library.count.label')}
            </span>
          </p>
          <p role="status" className="sr-only">{visible.length === 1 ? t('library.count.one') : t('library.count', { n: visible.length })}</p>
        </div>
        {canEdit && (
          <Link to="/library/new" className={buttonClass('primary')}>
            {t('library.add')}
          </Link>
        )}
      </div>

      <div className="lib-search relative">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-soft">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          className="h-12 w-full rounded-full border border-line bg-surface pl-11 pr-11 text-base text-ink placeholder:text-soft focus:border-io focus:outline-none focus:ring-2 focus:ring-io/30 [&::-webkit-search-cancel-button]:hidden"
          placeholder={t('library.search')}
          aria-label={t('library.search')}
          value={filters.query}
          onChange={(e) => set({ query: e.target.value })}
        />
        {filters.query && (
          <button type="button" aria-label={t('library.clearSearch')} onClick={() => set({ query: '' })} className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-soft hover:bg-line/60">
            ✕
          </button>
        )}
      </div>

      <div className="-mx-4 mt-3 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <Select
          variant="chip"
          on={filters.tag !== ''}
          label={t('library.allTags')}
          value={filters.tag}
          onChange={(v) => set({ tag: v })}
          options={[{ value: '', label: t('library.allTags') }, ...tags.map((tag) => ({ value: tag, label: tag }))]}
          className="shrink-0"
        />
        <Select
          variant="chip"
          on={filters.tuningId !== ''}
          label={t('library.allTunings')}
          value={filters.tuningId}
          onChange={(v) => set({ tuningId: v })}
          options={[{ value: '', label: t('library.allTunings') }, ...data.tunings.map((x) => ({ value: x.id, label: x.name }))]}
          className="shrink-0"
        />
        <Select
          variant="chip"
          on={filters.performerId !== ''}
          label={t('library.allPerformers')}
          value={filters.performerId}
          onChange={(v) => set({ performerId: v })}
          options={[{ value: '', label: t('library.allPerformers') }, ...data.performers.map((x) => ({ value: x.id, label: x.name }))]}
          className="shrink-0"
        />
        <Select
          variant="chip"
          label={t('library.sort')}
          value={sort}
          onChange={(v) => setSort(v as SongSort)}
          options={[
            { value: 'title', label: t('library.sort.title') },
            { value: 'artist', label: t('library.sort.artist') },
            { value: 'recent', label: t('library.sort.recent') },
          ]}
          className="shrink-0"
        />
        {activeCount > 0 && (
          <button type="button" className="h-10 shrink-0 whitespace-nowrap rounded-full px-3 text-sm font-semibold text-io motion-safe:animate-rise-in" onClick={() => setFilters(EMPTY_FILTERS)}>
            {t('library.clearFilters')} · {activeCount}
          </button>
        )}
      </div>

      {notice && <p role="alert" className="mt-2 text-sm font-semibold text-lei">{notice}</p>}

      {data.songs.length === 0 && (
        <div className="grid justify-items-center gap-3 py-12 text-center text-soft">
          <Spark />
          <p>{t('library.empty')}</p>
        </div>
      )}
      {data.songs.length > 0 && visible.length === 0 && (
        <div className="grid justify-items-center gap-3 py-12 text-center text-soft">
          <Spark />
          <p>{t('library.noResults')}</p>
          <button type="button" className={buttonClass('secondary')} onClick={() => setFilters(EMPTY_FILTERS)}>{t('library.clearFilters')}</button>
        </div>
      )}

      {groups.map(({ letter, songs }) => (
        <section key={letter || 'all'} id={letter ? `lib-${letter === '#' ? 'num' : letter}` : undefined} className="mt-3 scroll-mt-2">
          {letter && (
            <h2 className="lib-letter sticky top-0 z-10 -mx-4 flex items-center gap-3 bg-paper/80 px-4 py-1.5 font-display text-xl font-bold text-io">
              {letter}
              <span className="h-px flex-1 bg-line" />
              <span className="text-xs font-semibold text-soft tabular-nums">{songs.length}</span>
            </h2>
          )}
          <ul className="divide-y divide-line">
            {songs.map((song) => {
              const tuning = tunings.get(song.tuningId);
              const meta = [
                song.capo > 0 && `capo ${song.capo}`,
                song.durationSec && formatDuration(song.durationSec),
                song.tempo && `${song.tempo} BPM`,
              ].filter(Boolean);
              return (
                <li key={song.id} data-reveal className="relative flex items-center">
                  <RemoteFlash id={song.id} />
                  <Link
                    to={`/song/${song.id}`}
                    className="song-row flex min-h-[64px] min-w-0 flex-1 select-none items-center gap-3 px-1 py-2.5 [-webkit-touch-callout:none]"
                    draggable={false}
                    onPointerDown={startPress(song)}
                    onPointerMove={movePress}
                    onPointerUp={endPress}
                    onPointerLeave={endPress}
                    onPointerCancel={endPress}
                    onContextMenu={(e) => { e.preventDefault(); setMenu(song); }}
                    onClick={(e) => {
                      if (press.current.fired) { press.current.fired = false; e.preventDefault(); return; }
                    }}
                  >
                    <span aria-hidden className="key-disc grid h-11 w-11 shrink-0 place-items-center rounded-full bg-io/10 font-display text-[15px] font-bold text-io">
                      {song.key ? song.key : '♪'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[16.5px] font-semibold leading-tight"><Highlight text={song.title} terms={terms} /></div>
                      <div className="truncate text-[13px] text-soft">
                        {song.artist && <Highlight text={song.artist} terms={terms} />}
                        {song.artist && meta.length > 0 && ' · '}
                        {meta.join(' · ')}
                      </div>
                      {song.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {song.tags.map((tag) => (
                            <span key={tag} className="rounded bg-line/60 px-1.5 text-[11px] text-soft">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center">
                      {tuning && !tuning.isStandard && <TuningChip tuning={tuning} compact />}
                      <span className="flex gap-1">
                        {song.defaultPerformerIds.map((id) => {
                          const p = performers.get(id);
                          return p ? <PerformerBadge key={id} performer={p} /> : null;
                        })}
                      </span>
                    </div>
                  </Link>
                  <button
                    type="button"
                    aria-label={`${t('action.more')}: ${song.title}`}
                    onClick={() => setMenu(song)}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg text-soft transition-colors hover:bg-line/50 active:bg-line"
                  >
                    ⋯
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {grouped && groups.length > 1 && <LetterRail letters={groups.map((g) => g.letter)} onJump={jump} />}

      {menu && (
        <SongPeek
          song={menu}
          tuning={tunings.get(menu.tuningId)}
          performers={menu.defaultPerformerIds.flatMap((id) => performers.get(id) ?? [])}
          canEdit={canEdit}
          onClose={() => setMenu(null)}
          onCopy={() => { setCopying(menu); setMenu(null); }}
          onDelete={() => void remove(menu)}
        />
      )}
      {copying && <CopySongDialog song={copying} onClose={() => setCopying(null)} />}
    </main>
  );
}
