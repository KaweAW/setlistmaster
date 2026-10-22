import { useEffect, useRef } from 'react';
import type { DiagramEntry } from '../core/diagrams';
import { fretsText } from '../core/fingerings';
import { useT } from '../i18n';
import { ChordDiagram } from './ChordDiagram';

/** The diagrams of the chords of a song, in a row that wraps. Tapping one shows it large (same as tapping the chord in the text). */
export function DiagramStrip({ entries, onPick, className = '' }: { entries: DiagramEntry[]; onPick?: (name: string) => void; className?: string }) {
  const t = useT();
  const shown = entries.filter((e) => e.frets);
  if (shown.length === 0) return null;
  return (
    <div role="list" aria-label={t('chart.diagrams')} className={`diagram-strip flex flex-wrap gap-x-1 gap-y-3 ${className}`}>
      {shown.map((e) => (
        <button
          key={e.name}
          type="button"
          role="listitem"
          data-chord={e.name}
          onClick={() => onPick?.(e.name)}
          title={`${e.name} ${fretsText(e.frets!)}`}
          className="flex w-[4.6rem] flex-col items-center gap-0.5 rounded-lg p-1 transition-colors hover:bg-chord/10 focus-visible:bg-chord/10"
        >
          <span className="whitespace-nowrap font-mono text-[0.8rem] font-bold text-chord">{e.name}</span>
          <ChordDiagram frets={e.frets!} className="w-[4.1rem] overflow-visible text-ink" />
          <span className="font-mono text-[0.65rem] tracking-wider text-soft">{fretsText(e.frets!)}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * A chord shown large at the bottom of the screen, after a tap on it in the text or on its small diagram. It goes away by
 * itself after a few seconds, or with a tap anywhere else.
 */
export function ChordDock({ entry, onClose }: { entry: DiagramEntry | null; onClose: () => void }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!entry) return;
    const timer = setTimeout(onClose, 4500);
    const outside = (e: PointerEvent) => {
      const target = e.target as Element;
      if (box.current?.contains(target) || target.closest?.('[data-chord]')) return;
      onClose();
    };
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [entry, onClose]);
  if (!entry) return null;
  return (
    <div
      ref={box}
      role="dialog"
      aria-label={entry.name}
      className="fixed inset-x-3 z-40 mx-auto flex max-w-sm items-center justify-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4 text-ink shadow-2xl motion-safe:animate-rise-in print:hidden"
      style={{ bottom: 'calc(8.5rem + env(safe-area-inset-bottom))' }}
    >
      {entry.frets ? (
        <>
          <ChordDiagram frets={entry.frets} className="w-[6.5rem] overflow-visible" title={entry.name} />
          <div>
            <div className="font-mono text-2xl font-bold text-chord">{entry.name}</div>
            <div className="mt-1 font-mono text-sm tracking-widest text-soft">{fretsText(entry.frets)}</div>
            <div className="mt-2 text-xs text-soft">{t(entry.written ? 'chart.fingeringWritten' : 'chart.fingeringReady')}</div>
          </div>
        </>
      ) : (
        <div>
          <div className="font-mono text-2xl font-bold text-chord">{entry.name}</div>
          <p className="mt-1 max-w-[15rem] text-sm text-soft">{t('chart.noFingering', { name: entry.name })}</p>
        </div>
      )}
    </div>
  );
}
