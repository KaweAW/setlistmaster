import { RemoteFlash } from '../components/RemoteFlash';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { daysUntil, nextUpcoming, todayIso } from '../core/countdown';
import { formatDate, formatTotalDuration } from '../core/format';
import { setlistStats } from '../core/stats';
import type { Setlist } from '../core/types';
import { BandTabs, type BandTabsHandle } from '../components/BandTabs';
import { PerformerBadge } from '../components/PerformerBadge';
import { Button, buttonClass, PageTitle } from '../components/ui';
import { useCanEdit } from '../cloud/CloudProvider';
import { useData } from '../data/DataProvider';
import { createSetlist, deleteSetlist, duplicateSetlist } from '../data/setlistService';
import { useMagnetic, useHomeMotion } from '../hooks/useHomeMotion';
import { useQuery } from '../hooks/useQuery';
import { resetSwipe, useSwipeDrag } from '../hooks/useSwipeDrag';
import { useT } from '../i18n';
import { clearSlide, peekSlide } from '../state/bandSlide';
import { useUiStore } from '../state/uiStore';

const byDateDesc = (a: Setlist, b: Setlist) => (b.date ?? '').localeCompare(a.date ?? '') || b.updatedAt - a.updatedAt;

/** Loading placeholder: rows with a moving shine, so the page keeps its shape while the data arrives. */
function ListSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3 pt-2">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((i) => (
        <div key={i} aria-hidden className="rounded-xl border border-line bg-surface p-4" style={{ opacity: 1 - i * 0.22 }}>
          <div className="skeleton mb-2 h-6 w-2/3 rounded" />
          <div className="skeleton h-3.5 w-1/2 rounded" />
        </div>
      ))}
    </div>
  );
}

/** Empty list: a small equaliser that breathes, then the same sentence as before. */
function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <svg viewBox="0 0 80 48" width="120" height="72" aria-hidden className="mb-4 text-io">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <rect key={i} x={4 + i * 11} y="4" width="6" height="40" rx="3" fill="currentColor" opacity={0.35 + (i % 3) * 0.25} className="eq-bar motion-reduce:[animation:none]" style={{ animationDelay: `${i * 130}ms` }} />
        ))}
      </svg>
      <p className="text-soft">{text}</p>
    </div>
  );
}

/** "New setlist": a pill with a label at the top of the page that folds into a round "+" once you scroll; it leans toward the mouse. */
function NewFab({ label, compact, onClick }: { label: string; compact: boolean; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useMagnetic(ref);
  return createPortal(
    <button
      ref={ref}
      type="button"
      aria-label={label}
      data-compact={compact ? '' : undefined}
      onClick={() => {
        navigator.vibrate?.(8);
        onClick();
      }}
      className="fab fixed right-4 z-30 flex h-14 items-center gap-2 rounded-full bg-io px-4 text-base font-semibold text-white shadow-lg shadow-io/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink md:bottom-6 md:right-8"
      style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden className="shrink-0">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <span className="fab-label">{label}</span>
    </button>,
    document.body,
  );
}

/** The next dated setlist, big: how many days are left, and a wave that drifts as you scroll. */
function NextGig({ setlist, today, onOpen }: { setlist: Setlist; today: string; onOpen: string }) {
  const t = useT();
  const language = useUiStore((s) => s.language);
  const days = daysUntil(setlist.date!, today);
  return (
    <Link
      to={onOpen}
      data-reveal
      className="relative mb-5 block overflow-hidden rounded-2xl bg-chrome p-5 text-chrome-ink shadow-md transition-transform motion-safe:active:scale-[0.985]"
    >
      <svg aria-hidden viewBox="0 0 200 80" className="hero-wave pointer-events-none absolute -right-6 bottom-[-10px] w-72 text-io opacity-40">
        <path d="M0 50 Q25 20 50 50 T100 50 T150 50 T200 50 V80 H0Z" fill="currentColor" />
      </svg>
      <svg aria-hidden viewBox="0 0 200 80" className="hero-wave-b pointer-events-none absolute -right-2 bottom-[-22px] w-64 text-lei opacity-30">
        <path d="M0 55 Q25 30 50 55 T100 55 T150 55 T200 55 V80 H0Z" fill="currentColor" />
      </svg>
      <p className="relative text-xs font-semibold uppercase tracking-widest text-chrome-ink/70">{t('home.next')}</p>
      <p className="relative mt-1 truncate font-display text-3xl font-bold uppercase leading-tight tracking-wide">{setlist.title}</p>
      <p className="relative truncate text-sm text-chrome-ink/80">{[formatDate(setlist.date!, language), setlist.venue].filter(Boolean).join(' · ')}</p>
      <p className="relative mt-3 flex items-baseline gap-2">
        {days <= 1 ? (
          <span className="font-display text-5xl font-bold uppercase leading-none">{days === 0 ? t('home.today') : t('home.tomorrow')}</span>
        ) : (
          <>
            <span className="font-display text-6xl font-bold leading-none">{days}</span>
            <span className="text-sm font-semibold uppercase tracking-wide text-chrome-ink/75">{t('home.untilMany')}</span>
          </>
        )}
      </p>
    </Link>
  );
}

function SetlistList() {
  const t = useT();
  const language = useUiStore((s) => s.language);
  const navigate = useNavigate();
  const { store, band } = useData();
  const canEdit = useCanEdit(band.id);
  const [showArchived, setShowArchived] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const root = useRef<HTMLDivElement>(null);
  const [today] = useState(() => todayIso());

  const { data, loading, reload } = useQuery(async () => {
    const [setlists, items, songs, blocks, performers] = await Promise.all([
      store.setlists.listBy('bandId', band.id),
      store.items.listBy('bandId', band.id),
      store.songs.listBy('bandId', band.id),
      store.blocks.listBy('bandId', band.id),
      store.performers.listBy('bandId', band.id),
    ]);
    return { setlists, items, songs, blocks, performers };
  }, [store, band.id]);

  const compact = useHomeMotion(root, `${data ? data.setlists.map((s) => `${s.id}${s.archived ? 'a' : ''}`).join() : ''}|${showArchived}`, !loading && !!data);

  if (loading || !data) return <ListSkeleton label={t('app.loading')} />;

  const active = data.setlists.filter((s) => !s.archived).sort(byDateDesc);
  const archived = data.setlists.filter((s) => s.archived).sort(byDateDesc);

  async function create() {
    const setlist = await createSetlist(store, band.id, {
      title: t('setlist.defaultTitle'),
      firstBlock: t('block.defaultName', { n: 1 }),
    });
    navigate(`/setlist/${setlist.id}`, { state: { edit: true } });
  }

  async function duplicate(s: Setlist) {
    await duplicateSetlist(store, s.id, t('setlist.copyTitle', { title: s.title }));
    setOpenMenu(null);
    reload();
  }

  async function toggleArchive(s: Setlist) {
    await store.setlists.update(s.id, { archived: !s.archived });
    setOpenMenu(null);
    reload();
  }

  async function remove(s: Setlist) {
    if (!window.confirm(t('common.deleteConfirm', { name: s.title }))) return;
    await deleteSetlist(store, s.id);
    setOpenMenu(null);
    reload();
  }

  function row(s: Setlist) {
    const stats = setlistStats(
      data!.items.filter((i) => i.setlistId === s.id),
      data!.songs,
      new Set(data!.blocks.filter((b) => b.reserve).map((b) => b.id)),
    );
    const duration =
      stats.durationSec > 0
        ? stats.missingDurationCount > 0
          ? t('setlist.durationPartial', { d: formatTotalDuration(stats.durationSec) })
          : formatTotalDuration(stats.durationSec)
        : null;
    const meta = [
      s.date && formatDate(s.date, language),
      s.venue,
      stats.songCount === 1 ? t('library.count.one') : t('library.count', { n: stats.songCount }),
      duration,
    ].filter(Boolean);
    const menuOpen = openMenu === s.id;
    const away = s.date ? daysUntil(s.date, today) : NaN;
    const strip = away === 0 ? 'bg-lei' : away > 0 ? 'bg-io' : 'bg-line';
    const seen = new Set(data!.items.filter((i) => i.setlistId === s.id).flatMap((i) => i.performerIds));
    const singers = data!.performers.filter((p) => seen.has(p.id));
    return (
      <li key={s.id} data-reveal data-fx className="home-card mb-3 rounded-xl border border-line bg-surface py-1 pl-4 pr-2 shadow-sm">
        <span aria-hidden className={`absolute inset-y-3 left-1.5 w-1 rounded-full ${strip}`} />
        <RemoteFlash id={s.id} />
        <div className="flex items-center gap-2">
          <Link
            to={`/setlist/${s.id}`}
            className="min-h-[56px] min-w-0 flex-1 py-2"
          >
            <div className="truncate font-display text-xl font-bold uppercase leading-tight tracking-wide">{s.title}</div>
            <div className="truncate text-[13px] text-soft">{meta.join(' · ')}</div>
            {singers.length > 0 && (
              <div className="mt-1.5 flex -space-x-1.5" aria-hidden>
                {singers.slice(0, 5).map((p) => (
                  <span key={p.id} className="rounded-full ring-2 ring-surface"><PerformerBadge performer={p} size={20} /></span>
                ))}
                {singers.length > 5 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-line px-1 text-[10px] font-bold text-soft ring-2 ring-surface">+{singers.length - 5}</span>}
              </div>
            )}
          </Link>
          {canEdit && <Button
            variant="secondary"
            aria-label={`${t('action.more')}: ${s.title}`}
            aria-expanded={menuOpen}
            onClick={() => setOpenMenu(menuOpen ? null : s.id)}
          >
            ⋯
          </Button>}
        </div>
        {menuOpen && (
          <div className="mb-2 flex flex-wrap gap-2 slide-open">
            <Button variant="secondary" onClick={() => void duplicate(s)}>{t('action.duplicate')}</Button>
            <Button variant="secondary" onClick={() => void toggleArchive(s)}>
              {s.archived ? t('action.unarchive') : t('action.archive')}
            </Button>
            <Button variant="danger" onClick={() => void remove(s)}>{t('common.delete')}</Button>
          </div>
        )}
      </li>
    );
  }

  const upcoming = nextUpcoming(active, today);

  return (
    <div ref={root}>
      <div className="home-bar flex items-center justify-between gap-3">
        <div className="home-title"><PageTitle>{t('home.title')}</PageTitle></div>
        {!canEdit && <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-soft">{t('readonly.badge')}</span>}
      </div>
      {canEdit && <NewFab label={t('home.new')} compact={compact} onClick={() => void create()} />}

      {upcoming && <NextGig setlist={upcoming} today={today} onOpen={`/setlist/${upcoming.id}`} />}

      {active.length === 0 && <EmptyState text={t('home.empty')} />}
      <ul className="empty:hidden">{active.map(row)}</ul>

      {archived.length > 0 && (
        <div className="mt-6">
          <button type="button" className="h-11 text-sm font-semibold text-io" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? t('home.hideArchived') : t('home.showArchived', { n: archived.length })}
          </button>
          {showArchived && <ul className="opacity-80">{archived.map(row)}</ul>}
        </div>
      )}

      <Link to="/library" className={`${buttonClass('secondary')} mt-8 w-full justify-between`}>
        <span>{t('home.library')}</span>
        <span aria-hidden>{data.songs.length} →</span>
      </Link>
    </div>
  );
}

/** The home: band tabs on top, the setlists of the chosen band below. Both follow a horizontal drag of the finger. */
export default function HomePage() {
  const { band } = useData();
  const tabs = useRef<BandTabsHandle | null>(null);
  const main = useRef<HTMLElement>(null);
  const drag = useSwipeDrag(main, (d) => tabs.current?.allow(d) ?? null, (d) => tabs.current?.swipe(d));
  const from = peekSlide();
  useLayoutEffect(() => resetSwipe(main.current), [band.id]);
  useEffect(() => clearSlide(), [band.id]);
  return (
    <main ref={main} {...drag} className="mx-auto min-h-[70vh] w-full max-w-3xl px-4 py-6">
      <BandTabs handleRef={tabs} />
      <div className="swipe-content">
        <div key={band.id} className={from ? `band-in-${from}` : 'motion-safe:animate-fade-in'}>
          <SetlistList />
        </div>
      </div>
    </main>
  );
}
