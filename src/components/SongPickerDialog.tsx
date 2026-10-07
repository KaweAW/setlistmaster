import { useMemo, useRef, useState } from 'react';
import { EMPTY_FILTERS, filterSongs, sortSongs } from '../core/songFilter';
import type { Song } from '../core/types';
import { useT } from '../i18n';
import { Modal } from './Modal';
import { Button, Field, inputClass } from './ui';

const Check = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
const Plus = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
);

/**
 * Pick songs from the library (several in a row) or create a new one on the spot.
 * A song is a toggle: a tap adds it to the block, a second tap takes it out again (so it is never added twice;
 * the editor's Undo also covers a removal made by mistake).
 */
export function SongPickerDialog({
  songs,
  inBlock,
  inSetlist,
  onAdd,
  onRemove,
  onCreate,
  onClose,
}: {
  songs: Song[];
  /** Songs already in the block being filled. */
  inBlock: ReadonlySet<string>;
  /** Songs in any block of the setlist. */
  inSetlist: ReadonlySet<string>;
  onAdd: (songId: string) => void;
  onRemove: (songId: string) => void;
  onCreate: (title: string, artist: string) => Promise<Song>;
  onClose: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [titleError, setTitleError] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);

  const visible = useMemo(
    () => sortSongs(filterSongs(songs, { ...EMPTY_FILTERS, query }), 'title'),
    [songs, query],
  );

  function toggle(songId: string) {
    if (inSetlist.has(songId)) onRemove(songId);
    else onAdd(songId);
  }

  function startCreating() {
    setTitle(query.trim());
    setCreating(true);
    setTitleError(false);
  }

  async function create() {
    if (!title.trim()) return setTitleError(true);
    const song = await onCreate(title.trim(), artist.trim());
    onAdd(song.id);
    setTitle('');
    setArtist('');
    setQuery('');
    setCreating(false);
  }

  const count = inBlock.size;
  return (
    <Modal
      title={t('picker.title')}
      onClose={onClose}
      footer={
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-sm text-soft" role="status" aria-live="polite">
            {count === 0 ? t('picker.none') : count === 1 ? t('picker.count.one') : t('picker.count', { n: count })}
          </span>
          {!creating && <Button variant="secondary" onClick={startCreating}>+ {t('picker.create')}</Button>}
          <Button onClick={onClose}>{t('common.done')}</Button>
        </div>
      }
    >
      <div className="sticky top-0 z-10 -mx-5 bg-paper px-5 pb-2 pt-1">
        <input
          type="search"
          className={inputClass}
          placeholder={t('library.search')}
          aria-label={t('library.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {creating && (
        <form
          className="mb-3 space-y-3 rounded-xl border border-line bg-surface p-3 motion-safe:animate-rise-in"
          onSubmit={(e) => { e.preventDefault(); void create(); }}
        >
          <Field label={t('field.title')} error={titleError ? t('validation.required') : undefined}>
            <input ref={titleInput} autoFocus className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label={t('field.artist')}>
            <input className={inputClass} value={artist} onChange={(e) => setArtist(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit">{t('picker.createAndAdd')}</Button>
            <Button variant="secondary" onClick={() => setCreating(false)}>{t('common.cancel')}</Button>
          </div>
        </form>
      )}

      {visible.length === 0 && !creating && (
        <div className="py-8 text-center text-soft">
          <p>{t('picker.empty')}</p>
          <Button variant="secondary" className="mt-3" onClick={startCreating}>+ {t('picker.create')}</Button>
        </div>
      )}

      <ul className="divide-y divide-line">
        {visible.map((song) => {
          const here = inBlock.has(song.id);
          const elsewhere = !here && inSetlist.has(song.id);
          const on = here || elsewhere;
          return (
            <li key={song.id}>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => toggle(song.id)}
                className={`group flex min-h-[56px] w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition-colors active:bg-line/40 sm:hover:bg-line/25 ${on ? 'bg-io/5' : ''}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{song.title}</span>
                  <span className="block truncate text-[13px] text-soft">
                    {song.artist}
                    {elsewhere && <span className="text-io">{song.artist ? ' · ' : ''}{t('picker.already')}</span>}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 transition-all duration-150 ${
                    on ? 'scale-100 border-io bg-io text-white' : 'border-line text-soft group-active:scale-90'
                  }`}
                >
                  <span key={String(on)} className="motion-safe:animate-pop">{on ? <Check /> : <Plus />}</span>
                </span>
                <span className="sr-only">{here ? t('picker.added') : elsewhere ? t('picker.already') : t('picker.add')}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
