import { useRef, useState } from 'react';
import { clampBpm, tapTempo } from '../core/metronome';
import { useMetronome } from '../hooks/useMetronome';
import { useT } from '../i18n';

const BEATS = 4;

/** A small metronome under the song header: starts at the song's tempo, adjustable and tappable, with a light per beat. */
export function MetronomePanel({ initialBpm }: { initialBpm: number | undefined }) {
  const t = useT();
  const [bpm, setBpm] = useState(clampBpm(initialBpm ?? 100));
  const { running, beat, toggle } = useMetronome(bpm, BEATS);
  const taps = useRef<number[]>([]);
  const button = 'h-11 w-11 shrink-0 rounded-md border border-line bg-surface text-2xl font-semibold leading-none active:bg-line/40';

  const tap = () => {
    taps.current = [...taps.current.slice(-5), Date.now()];
    const tapped = tapTempo(taps.current);
    if (tapped) setBpm(tapped);
  };

  return (
    <div role="group" aria-label={t('metro.title')} className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface/70 p-2">
      <button
        type="button"
        aria-pressed={running}
        onClick={toggle}
        className={`h-11 min-w-[6.5rem] rounded-md px-3 font-semibold ${running ? 'bg-lei text-white' : 'bg-chrome text-chrome-ink'}`}
      >
        {running ? `■ ${t('metro.stop')}` : `▶ ${t('metro.start')}`}
      </button>
      <button type="button" aria-label={`${t('metro.bpm')} −1`} onClick={() => setBpm(clampBpm(bpm - 1))} className={button}>−</button>
      <span aria-label={`${t('metro.bpm')}: ${bpm}`} className="min-w-[4.5rem] text-center font-display text-xl font-bold">
        {bpm} <small className="text-xs font-normal text-soft">BPM</small>
      </span>
      <button type="button" aria-label={`${t('metro.bpm')} +1`} onClick={() => setBpm(clampBpm(bpm + 1))} className={button}>+</button>
      <button type="button" onClick={tap} className="h-11 rounded-md border border-line bg-surface px-3 text-sm font-semibold active:bg-line/40">
        {t('metro.tap')}
      </button>
      <span aria-hidden className="ml-auto flex gap-1.5">
        {Array.from({ length: BEATS }, (_, i) => (
          <span key={i} className={`h-3.5 w-3.5 rounded-full border border-line ${beat === i ? (i === 0 ? 'bg-lei' : 'bg-io') : 'bg-transparent'}`} />
        ))}
      </span>
    </div>
  );
}
