import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n';

function Stepper({
  label, value, onDec, onInc, decLabel, incLabel, decDisabled, incDisabled, onReset,
}: {
  label: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
  decLabel: string;
  incLabel: string;
  decDisabled?: boolean;
  incDisabled?: boolean;
  onReset?: () => void;
}) {
  const button = 'h-11 w-11 shrink-0 bg-white/10 text-2xl font-semibold leading-none hover:bg-white/20 active:bg-white/30 disabled:opacity-30';
  return (
    <div>
      <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-chrome-ink/60">{label}</div>
      <div className="flex items-stretch overflow-hidden rounded-md">
        <button type="button" aria-label={decLabel} disabled={decDisabled} onClick={onDec} className={button}>−</button>
        <button
          type="button"
          aria-label={`${label}: ${value}`}
          onClick={onReset}
          disabled={!onReset}
          className="min-w-[3.5rem] flex-1 bg-white/5 px-1 text-center font-display text-lg font-bold disabled:cursor-default"
        >
          {value}
        </button>
        <button type="button" aria-label={incLabel} disabled={incDisabled} onClick={onInc} className={button}>+</button>
      </div>
    </div>
  );
}

export interface SongToolbarProps {
  /** Transposing, capo and text size only make sense for the chord sheet, not for a PDF. */
  showChartControls: boolean;
  semitones: number;
  onSemitones: (n: number) => void;
  capo: number;
  onCapo: (n: number) => void;
  fontSize: number;
  onFontSize: (n: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
  scrollLevel: number;
  onScrollLevel: (n: number) => void;
  /** The next song of the setlist: always one big tap away. */
  next?: { title: string; to: string };
  stage?: boolean;
}

/** Fixed bottom bar. Auto-scroll is always at hand; the other controls fold away to leave room for the music. */
export function SongToolbar(p: SongToolbarProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 bg-chrome text-chrome-ink shadow-[0_-4px_16px_rgba(0,0,0,.25)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto max-w-3xl px-3 py-2">
        {open && p.showChartControls && (
          <div className="mb-3 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3">
            <Stepper
              label={t('chart.transpose')}
              value={signed(p.semitones)}
              decLabel={`${t('chart.transpose')} −1`}
              incLabel={`${t('chart.transpose')} +1`}
              onDec={() => p.onSemitones(p.semitones - 1)}
              onInc={() => p.onSemitones(p.semitones + 1)}
              onReset={p.semitones !== 0 ? () => p.onSemitones(0) : undefined}
            />
            <Stepper
              label={t('chart.capo')}
              value={p.capo === 0 ? '–' : String(p.capo)}
              decLabel={`${t('chart.capo')} −1`}
              incLabel={`${t('chart.capo')} +1`}
              decDisabled={p.capo <= 0}
              incDisabled={p.capo >= 12}
              onDec={() => p.onCapo(p.capo - 1)}
              onInc={() => p.onCapo(p.capo + 1)}
            />
            <Stepper
              label={t('chart.textSize')}
              value={String(p.fontSize)}
              decLabel={`${t('chart.textSize')} −`}
              incLabel={`${t('chart.textSize')} +`}
              onDec={() => p.onFontSize(p.fontSize - 2)}
              onInc={() => p.onFontSize(p.fontSize + 2)}
            />
          </div>
        )}
        {p.next && (
          <Link
            to={p.next.to}
            replace
            className={`mb-2 flex w-full items-center justify-between gap-3 rounded-md bg-lei px-4 font-semibold text-white active:opacity-80 ${p.stage ? 'min-h-[3.75rem] text-xl' : 'min-h-[2.75rem] text-base'}`}
          >
            <span className="truncate">{t('chart.nextUp', { title: p.next.title })}</span>
            <span aria-hidden>→</span>
          </Link>
        )}
        <div className="flex items-end gap-3">
          <button
            type="button"
            onClick={p.onTogglePlay}
            aria-pressed={p.playing}
            className={`h-11 min-w-[7.5rem] rounded-md px-4 text-base font-semibold ${p.playing ? 'bg-lei text-white' : 'bg-chrome-ink text-chrome'}`}
          >
            {p.playing ? `⏸ ${t('chart.pause')}` : `▶ ${t('chart.play')}`}
          </button>
          <div className="flex-1">
            <Stepper
              label={t('chart.speed')}
              value={String(p.scrollLevel)}
              decLabel={`${t('chart.speed')} −`}
              incLabel={`${t('chart.speed')} +`}
              decDisabled={p.scrollLevel <= 1}
              incDisabled={p.scrollLevel >= 10}
              onDec={() => p.onScrollLevel(p.scrollLevel - 1)}
              onInc={() => p.onScrollLevel(p.scrollLevel + 1)}
            />
          </div>
          {p.showChartControls && (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-label={t('chart.controls')}
              className="h-11 w-11 shrink-0 rounded-md bg-white/10 text-xl hover:bg-white/20"
            >
              {open ? '▾' : 'Aa'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
