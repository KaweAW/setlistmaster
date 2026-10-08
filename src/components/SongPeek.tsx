import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { parseChordPro } from '../core/chordpro';
import { formatDuration } from '../core/format';
import type { Performer, Song, Tuning } from '../core/types';
import { useT } from '../i18n';
import { PerformerBadge } from './PerformerBadge';
import { TuningChip } from './TuningChip';

const PREVIEW_LINES = 9;

/** The first lines of the song as plain text: section titles and lyrics, no chords. */
function previewOf(chordpro: string): { kind: 'label' | 'text'; text: string }[] {
  const out: { kind: 'label' | 'text'; text: string }[] = [];
  for (const line of parseChordPro(chordpro).lines) {
    if (out.length >= PREVIEW_LINES) break;
    if (line.kind === 'label' && line.text) out.push({ kind: 'label', text: line.text });
    else if (line.kind === 'lyrics') {
      const text = line.segments.map((s) => s.lyrics).join('').trim();
      if (text) out.push({ kind: 'text', text });
    }
  }
  return out;
}

const icon = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
);
const OpenIcon = () => icon(<><path d="M9 18V6l10 6z" /></>);
const EditIcon = () => icon(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>);
const CopyIcon = () => icon(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></>);
const TrashIcon = () => icon(<><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>);

/**
 * What a long press on a song opens, like holding a chat on a phone: the song floats up as a card with a peek at its
 * lyrics, and the things you can do with it sit under it. Tap anywhere outside (or press Esc) to put it away.
 */
export function SongPeek({
  song,
  tuning,
  performers,
  canEdit,
  onClose,
  onCopy,
  onDelete,
}: {
  song: Song;
  tuning: Tuning | undefined;
  performers: Performer[];
  canEdit: boolean;
  onClose: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const lines = useMemo(() => previewOf(song.chordpro), [song.chordpro]);
  const [openedAt] = useState(() => Date.now());
  // The finger that opened this is still down: its release must not tap (or dismiss) what is now under it.
  const tooSoon = () => Date.now() - openedAt < 450;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const meta = [song.capo > 0 && `capo ${song.capo}`, song.durationSec && formatDuration(song.durationSec), song.tempo && `${song.tempo} BPM`].filter(Boolean);
  const row = 'flex min-h-[52px] w-full items-center justify-between gap-3 px-4 text-left text-[17px] font-semibold transition-colors active:bg-line/50 sm:hover:bg-line/30';

  return createPortal(
    <div
      className="peek-backdrop fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-chrome/45 p-4 backdrop-blur-md motion-safe:animate-fade-in"
      onClick={() => !tooSoon() && onClose()}
      onClickCapture={(e) => { if (tooSoon()) { e.preventDefault(); e.stopPropagation(); } }}
    >
      <div className="flex w-full max-w-[22rem] flex-col gap-3 py-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={song.title}>
        <div className="overflow-hidden motion-safe:animate-peek-in rounded-3xl bg-surface shadow-2xl ring-1 ring-black/5">
          <div className="flex items-start gap-3 px-5 pb-3 pt-5">
            <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-io/10 font-display text-lg font-bold text-io">{song.key || '♪'}</span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-2xl font-bold uppercase leading-tight tracking-wide">{song.title}</h2>
              {song.artist && <p className="truncate text-[15px] text-soft">{song.artist}</p>}
              {meta.length > 0 && <p className="mt-0.5 text-[13px] text-soft">{meta.join(' · ')}</p>}
            </div>
          </div>
          {((tuning && !tuning.isStandard) || performers.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
              {tuning && !tuning.isStandard && <TuningChip tuning={tuning} compact />}
              {performers.map((p) => <PerformerBadge key={p.id} performer={p} />)}
            </div>
          )}
          <div className="relative max-h-48 overflow-hidden border-t border-line px-5 py-3">
            {lines.length > 0 ? (
              <div className="space-y-0.5 text-[15px] leading-snug">
                {lines.map((l, i) =>
                  l.kind === 'label' ? (
                    <p key={i} className={`font-display text-xs font-bold uppercase tracking-widest text-io ${i > 0 ? 'pt-2' : ''}`}>{l.text}</p>
                  ) : (
                    <p key={i} className="truncate">{l.text}</p>
                  ),
                )}
              </div>
            ) : (
              <p className="text-[15px] text-soft">{t('chart.empty')}</p>
            )}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent" />
          </div>
        </div>

        <div role="menu" aria-label={song.title} style={{ animationDelay: '70ms' }} className="motion-safe:animate-rise-in divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-xl ring-1 ring-black/5">
          <Link role="menuitem" to={`/song/${song.id}`} className={row}>{t('menu.open')}<OpenIcon /></Link>
          {canEdit && <Link role="menuitem" to={`/library/${song.id}`} className={row}>{t('common.edit')}<EditIcon /></Link>}
          <button type="button" role="menuitem" onClick={onCopy} className={row}>{t('copy.action')}<CopyIcon /></button>
          {canEdit && <button type="button" role="menuitem" onClick={onDelete} className={`${row} text-lei`}>{t('common.delete')}<TrashIcon /></button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
