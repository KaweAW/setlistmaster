import { RemoteFlash } from '../components/RemoteFlash';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDuration } from '../core/format';
import { collectTags, EMPTY_FILTERS, filterSongs, sortSongs, type SongSort } from '../core/songFilter';
import { PerformerBadge } from '../components/PerformerBadge';
import { TuningChip } from '../components/TuningChip';
import { buttonClass, inputClass, PageTitle } from '../components/ui';
import { useCanEdit } from '../cloud/CloudProvider';
import { useData } from '../data/DataProvider';
import { useQuery } from '../hooks/useQuery';
import { useT } from '../i18n';

export default function LibraryPage() {
  const t = useT();
  const { store, band } = useData();
  const canEdit = useCanEdit(band.id);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState<SongSort>('title');

  const { data, loading } = useQuery(async () => {
    const [songs, performers, tunings] = await Promise.all([
      store.songs.listBy('bandId', band.id),
      store.performers.listBy('bandId', band.id),
      store.tunings.listBy('bandId', band.id),
    ]);
    return { songs, performers, tunings };
  }, [store, band.id]);

  const visible = useMemo(
    () => (data ? sortSongs(filterSongs(data.songs, filters), sort) : []),
    [data, filters, sort],
  );
  const tags = useMemo(() => (data ? collectTags(data.songs) : []), [data]);

  if (loading || !data) return <p className="p-6 text-soft">{t('app.loading')}</p>;

  const performers = new Map(data.performers.map((p) => [p.id, p]));
  const tunings = new Map(data.tunings.map((x) => [x.id, x]));
  const set = (patch: Partial<typeof filters>) => setFilters((f) => ({ ...f, ...patch }));
  const filtered = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <PageTitle>{t('library.title')}</PageTitle>
        {canEdit && (
          <Link to="/library/new" className={buttonClass('primary')}>
            {t('library.add')}
          </Link>
        )}
      </div>

      <input
        type="search"
        className={inputClass}
        placeholder={t('library.search')}
        aria-label={t('library.search')}
        value={filters.query}
        onChange={(e) => set({ query: e.target.value })}
      />

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select className={inputClass} aria-label={t('library.allTags')} value={filters.tag} onChange={(e) => set({ tag: e.target.value })}>
          <option value="">{t('library.allTags')}</option>
          {tags.map((tag) => (
            <option key={tag} value={tag}>{tag}</option>
          ))}
        </select>
        <select className={inputClass} aria-label={t('library.allTunings')} value={filters.tuningId} onChange={(e) => set({ tuningId: e.target.value })}>
          <option value="">{t('library.allTunings')}</option>
          {data.tunings.map((x) => (
            <option key={x.id} value={x.id}>{x.name}</option>
          ))}
        </select>
        <select className={inputClass} aria-label={t('library.allPerformers')} value={filters.performerId} onChange={(e) => set({ performerId: e.target.value })}>
          <option value="">{t('library.allPerformers')}</option>
          {data.performers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select className={inputClass} aria-label={t('library.sort')} value={sort} onChange={(e) => setSort(e.target.value as SongSort)}>
          <option value="title">{t('library.sort.title')}</option>
          <option value="artist">{t('library.sort.artist')}</option>
          <option value="recent">{t('library.sort.recent')}</option>
        </select>
      </div>

      <div className="mb-1 mt-4 flex items-center justify-between text-sm text-soft">
        <span>{visible.length === 1 ? t('library.count.one') : t('library.count', { n: visible.length })}</span>
        {filtered && (
          <button type="button" className="h-11 px-2 font-semibold text-io" onClick={() => setFilters(EMPTY_FILTERS)}>
            {t('library.clearFilters')}
          </button>
        )}
      </div>

      {data.songs.length === 0 && <p className="py-8 text-center text-soft">{t('library.empty')}</p>}
      {data.songs.length > 0 && visible.length === 0 && (
        <p className="py-8 text-center text-soft">{t('library.noResults')}</p>
      )}

      <ul className="divide-y divide-line border-y border-line">
        {visible.map((song) => {
          const tuning = tunings.get(song.tuningId);
          const meta = [
            song.key && (song.capo > 0 ? `${song.key} · capo ${song.capo}` : song.key),
            song.durationSec && formatDuration(song.durationSec),
            song.tempo && `${song.tempo} BPM`,
          ].filter(Boolean);
          return (
            <li key={song.id} className="relative">
              <RemoteFlash id={song.id} />
              <Link to={`/song/${song.id}`} className="flex min-h-[56px] items-center gap-3 py-2.5 active:bg-line/30">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16.5px] font-semibold leading-tight">{song.title}</div>
                  <div className="truncate text-[13px] text-soft">
                    {[song.artist, ...meta].filter(Boolean).join(' · ')}
                  </div>
                  {song.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {song.tags.map((tag) => (
                        <span key={tag} className="rounded bg-line/60 px-1.5 text-[11px] text-soft">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {tuning && !tuning.isStandard && (
                    <span className="mr-1">
                      <TuningChip tuning={tuning} />
                    </span>
                  )}
                  {song.defaultPerformerIds.map((id) => {
                    const p = performers.get(id);
                    return p ? <PerformerBadge key={id} performer={p} /> : null;
                  })}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
