import { useEffect, useRef, useState } from 'react';
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
  const button = 'h-11 w-11 shrink-0 bg-white/10 text-2xl font-semibold leading-none transition-colors hover:bg-white/20 active:bg-white/30 disabled:opacity-30';
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

/** A slider on the dark bar: dragging it gives a small tick under the finger on phones that can vibrate. */
function Slider({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void }) {
  return (
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => {
        navigator.vibrate?.(4);
        onChange(Number(e.target.value));
      }}
      className="toolbar-range mt-2 h-6 w-full"
    />
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
  /** Called when the "next song" bar is used, so the page can slide the new song in. */
  onNext?: () => void;
  stage?: boolean;
  /** The display controls can be opened from outside (the key chip opens them to transpose). */
  controlsOpen?: boolean;
  onControlsOpen?: (open: boolean) => void;
}

/**
 * Fixed bottom bar. Auto-scroll is always at hand; the other controls fold away to leave room for the music. While you read
 * (scrolling down, or the page scrolling by itself) the bar sinks into a small pill with play, speed and a way back, and it
 * returns on a scroll up or at the end of the song, where "next" matters.
 */
export function SongToolbar(p: SongToolbarProps) {
  const t = useT();
  const [innerOpen, setInnerOpen] = useState(false);
  const open = p.controlsOpen ?? innerOpen;
  const setOpen = (v: boolean) => (p.onControlsOpen ? p.onControlsOpen(v) : setInnerOpen(v));
  const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

  const [away, setAway] = useState(false);
  const [pinned, setPinned] = useState(false);
  const anchor = useRef(0);
  const pinTimer = useRef(0);
  useEffect(() => {
    anchor.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const atEnd = window.innerHeight + y >= document.documentElement.scrollHeight - 90;
      if (atEnd || y < 80) {
        setAway(false);
        anchor.current = y;
      } else if (y - anchor.current > 36) {
        setAway(true);
        anchor.current = y;
      } else if (anchor.current - y > 18) {
        setAway(false);
        anchor.current = y;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      clearTimeout(pinTimer.current);
    };
  }, []);
  const pin = () => {
    setPinned(true);
    setAway(false);
    clearTimeout(pinTimer.current);
    pinTimer.current = +setTimeout(() => setPinned(false), 7000);
  };
  const bar = useRef<HTMLDivElement>(null);
  // The panel folds away on a tap outside the bar or when the reader scrolls the page by hand (not on the auto-scroll).
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      const target = e.target as Element;
      if (target.closest?.('[data-keep-controls]')) return; // the chip that toggles the panel does it itself
      if (bar.current && !bar.current.contains(target)) setOpen(false);
    };
    const touched = (e: Event) => {
      if (bar.current && !bar.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('wheel', touched, { passive: true });
    window.addEventListener('touchmove', touched, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('wheel', touched);
      window.removeEventListener('touchmove', touched);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const mini = away && !pinned && !open;

  return (
    <>
      <div
        ref={bar}
        className={`fixed inset-x-0 bottom-0 z-30 rounded-t-2xl bg-chrome text-chrome-ink shadow-[0_-6px_24px_rgba(0,0,0,.28)] transition-transform duration-300 ease-out ${mini ? 'pointer-events-none translate-y-full' : ''}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        {...(mini ? ({ inert: '' } as object) : {})}
      >
        <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] rounded-t-2xl bg-gradient-to-r from-lei via-coro to-io" />
        <div className="mx-auto max-w-3xl px-3 pb-2 pt-3">
          {open && p.showChartControls && (
            <div className="mb-3 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 motion-safe:animate-rise-in" role="group" aria-label={t('controls.title')}>
              <div className="col-span-full -mb-1 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-chrome-ink/70">{t('controls.title')}</span>
                <button type="button" aria-label={t('controls.close')} onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-lg leading-none hover:bg-white/20">✕</button>
              </div>
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
              <div className="col-span-2 sm:col-span-1">
                <Stepper
                  label={t('chart.textSize')}
                  value={String(p.fontSize)}
                  decLabel={`${t('chart.textSize')} −`}
                  incLabel={`${t('chart.textSize')} +`}
                  onDec={() => p.onFontSize(p.fontSize - 2)}
                  onInc={() => p.onFontSize(p.fontSize + 2)}
                />
                <Slider label={t('chart.textSizeSlider')} value={p.fontSize} min={12} max={48} step={2} onChange={p.onFontSize} />
              </div>
            </div>
          )}
          {p.next && (
            <Link
              to={p.next.to}
              replace
              onClick={p.onNext}
              className={`mb-2 flex w-full items-center justify-between gap-3 rounded-lg bg-lei px-4 font-semibold text-white transition-transform active:scale-[0.99] active:opacity-90 ${p.stage ? 'min-h-[3.75rem] text-xl' : 'min-h-[2.75rem] text-base'}`}
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
              className={`h-11 min-w-[7.5rem] whitespace-nowrap rounded-md px-3 text-base font-semibold transition-colors active:scale-[0.97] ${p.playing ? 'bg-lei text-white' : 'bg-chrome-ink text-chrome'}`}
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
                className="h-11 w-11 shrink-0 rounded-md bg-white/10 text-xl transition-colors hover:bg-white/20"
              >
                {open ? '▾' : 'Aa'}
              </button>
            )}
          </div>
          {open && <Slider label={t('chart.speedSlider')} value={p.scrollLevel} min={1} max={10} onChange={p.onScrollLevel} />}
        </div>
      </div>

      {mini && (
        <div className="pointer-events-none fixed inset-x-0 z-30 flex justify-center" style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
        <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-chrome p-1.5 text-chrome-ink shadow-xl motion-safe:animate-rise-in">
          <button
            type="button"
            onClick={p.onTogglePlay}
            aria-pressed={p.playing}
            className={`h-11 whitespace-nowrap rounded-full px-4 text-base font-semibold ${p.playing ? 'bg-lei text-white' : 'bg-chrome-ink text-chrome'}`}
          >
            {p.playing ? `⏸ ${t('chart.pause')}` : `▶ ${t('chart.play')}`}
          </button>
          <button type="button" aria-label={`${t('chart.speed')} −`} disabled={p.scrollLevel <= 1} onClick={() => p.onScrollLevel(p.scrollLevel - 1)} className="h-11 w-9 text-xl disabled:opacity-30">−</button>
          <span aria-label={`${t('chart.speed')}: ${p.scrollLevel}`} className="min-w-[1.5rem] text-center font-display text-lg font-bold">{p.scrollLevel}</span>
          <button type="button" aria-label={`${t('chart.speed')} +`} disabled={p.scrollLevel >= 10} onClick={() => p.onScrollLevel(p.scrollLevel + 1)} className="h-11 w-9 text-xl disabled:opacity-30">+</button>
          <button type="button" aria-label={t('chart.controls')} onClick={pin} className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-lg">▴</button>
        </div>
        </div>
      )}
    </>
  );
}
