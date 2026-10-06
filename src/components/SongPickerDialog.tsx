import { useMemo, useState } from 'react';
import { EMPTY_FILTERS, filterSongs, sortSongs } from '../core/songFilter';
import type { Song } from '../core/types';
import { useT } from '../i18n';
import { Modal } from './Modal';
import { Button, Field, inputClass } from './ui';

/** Pick songs from the library (several in a row) or create a new one on the spot. */
export function SongPickerDialog({
  songs,
  inSetlist,
  onAdd,
  onCreate,
  onClose,
}: {
  songs: Song[];
  inSetlist: ReadonlySet<string>;
  onAdd: (songId: string) => void;
  onCreate: (title: string, artist: string) => Promise<Song>;
  onClose: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [titleError, setTitleError] = useState(false);

  const visible = useMemo(
    () => sortSongs(filterSongs(songs, { ...EMPTY_FILTERS, query }), 'title'),
    [songs, query],
  );

  function add(songId: string) {
    onAdd(songId);
    setAdded((a) => new Set(a).add(songId));
  }

  async function create() {
    if (!title.trim()) return setTitleError(true);
    const song = await onCreate(title.trim(), artist.trim());
    add(song.id);
    setTitle('');
    setArtist('');
    setCreating(false);
  }

  return (
    <Modal title={t('picker.title')} onClose={onClose}>
      <input
        type="search"
        className={inputClass}
        placeholder={t('library.search')}
        aria-label={t('library.search')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <ul className="mt-3 max-h-[40vh] divide-y divide-line overflow-y-auto border-y border-line">
        {visible.map((song) => (
          <li key={song.id}>
            <button
              type="button"
              onClick={() => add(song.id)}
              className="flex min-h-[52px] w-full items-center gap-3 py-2 text-left active:bg-line/30"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{song.title}</span>
                <span className="block truncate text-[13px] text-soft">{song.artist}</span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-io">
                {added.has(song.id) ? `✓ ${t('picker.added')}` : inSetlist.has(song.id) ? t('picker.already') : '+'}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        {creating ? (
          <div className="space-y-3 rounded-md border border-line bg-surface p-3">
            <Field label={t('field.title')} error={titleError ? t('validation.required') : undefined}>
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label={t('field.artist')}>
              <input className={inputClass} value={artist} onChange={(e) => setArtist(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button onClick={() => void create()}>{t('picker.createAndAdd')}</Button>
              <Button variant="secondary" onClick={() => setCreating(false)}>{t('common.cancel')}</Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setCreating(true)}>+ {t('picker.create')}</Button>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={onClose}>{t('common.done')}</Button>
      </div>
    </Modal>
  );
}
