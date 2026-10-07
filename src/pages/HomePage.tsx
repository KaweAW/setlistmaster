import { RemoteFlash } from '../components/RemoteFlash';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDate, formatTotalDuration } from '../core/format';
import { setlistStats } from '../core/stats';
import type { Setlist } from '../core/types';
import { BandTabs, type BandTabsHandle } from '../components/BandTabs';
import { Button, buttonClass, PageTitle } from '../components/ui';
import { useCanEdit } from '../cloud/CloudProvider';
import { useData } from '../data/DataProvider';
import { createSetlist, deleteSetlist, duplicateSetlist } from '../data/setlistService';
import { useQuery } from '../hooks/useQuery';
import { resetSwipe, useSwipeDrag } from '../hooks/useSwipeDrag';
import { useT } from '../i18n';
import { clearSlide, peekSlide } from '../state/bandSlide';
import { useUiStore } from '../state/uiStore';

const byDateDesc = (a: Setlist, b: Setlist) => (b.date ?? '').localeCompare(a.date ?? '') || b.updatedAt - a.updatedAt;

function SetlistList() {
  const t = useT();
  const language = useUiStore((s) => s.language);
  const navigate = useNavigate();
  const { store, band } = useData();
  const canEdit = useCanEdit(band.id);
  const [showArchived, setShowArchived] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const { data, loading, reload } = useQuery(async () => {
    const [setlists, items, songs, blocks] = await Promise.all([
      store.setlists.listBy('bandId', band.id),
      store.items.listBy('bandId', band.id),
      store.songs.listBy('bandId', band.id),
      store.blocks.listBy('bandId', band.id),
    ]);
    return { setlists, items, songs, blocks };
  }, [store, band.id]);

  if (loading || !data) return <p className="p-6 text-soft">{t('app.loading')}</p>;

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
    return (
      <li key={s.id} className="relative py-1">
        <RemoteFlash id={s.id} />
        <div className="flex items-center gap-2">
          <Link to={`/setlist/${s.id}`} className="min-h-[56px] min-w-0 flex-1 py-2 active:bg-line/30">
            <div className="truncate font-display text-xl font-bold uppercase leading-tight tracking-wide">{s.title}</div>
            <div className="truncate text-[13px] text-soft">{meta.join(' · ')}</div>
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

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <PageTitle>{t('home.title')}</PageTitle>
        {canEdit ? <Button onClick={() => void create()}>{t('home.new')}</Button> : <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-soft">{t('readonly.badge')}</span>}
      </div>

      {active.length === 0 && <p className="py-8 text-center text-soft">{t('home.empty')}</p>}
      <ul className="divide-y divide-line border-y border-line empty:hidden">{active.map(row)}</ul>

      {archived.length > 0 && (
        <div className="mt-6">
          <button type="button" className="h-11 text-sm font-semibold text-io" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? t('home.hideArchived') : t('home.showArchived', { n: archived.length })}
          </button>
          {showArchived && <ul className="divide-y divide-line border-y border-line opacity-80">{archived.map(row)}</ul>}
        </div>
      )}

      <Link to="/library" className={`${buttonClass('secondary')} mt-8 w-full justify-between`}>
        <span>{t('home.library')}</span>
        <span aria-hidden>{data.songs.length} →</span>
      </Link>
    </>
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
