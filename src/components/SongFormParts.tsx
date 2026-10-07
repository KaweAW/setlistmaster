import { useRef } from 'react';
import { splitKey, TONICS } from '../core/chords';
import { clampBpm, tapTempo } from '../core/metronome';
import { useMetronome } from '../hooks/useMetronome';
import { useT } from '../i18n';
import { Segmented } from './Segmented';

/**
 * The key as a grid of twelve tonics and a major / minor switch. It writes the same text the input holds ("Em", "F#"),
 * so free text such as "Em7" still works in the input and simply shows no tonic selected.
 */
export function KeyPicker({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const t = useT();
  const parsed = splitKey(value);
  const minor = parsed?.minor ?? false;
  return (
    <div role="group" aria-label={t('key.pick')} className="space-y-2">
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
        {TONICS.map((tonic) => {
          const on = parsed?.tonic === tonic;
          return (
            <button
              key={tonic}
              type="button"
              aria-pressed={on}
              aria-label={`${tonic}${minor ? 'm' : ''}`}
              onClick={() => onChange(on ? '' : `${tonic}${minor ? 'm' : ''}`)}
              className={`h-10 rounded-md border text-sm font-bold transition-all duration-150 active:scale-95 ${on ? 'scale-105 border-ink bg-ink text-paper shadow-sm' : 'border-line bg-surface text-ink hover:border-io/60'}`}
            >
              {tonic}
            </button>
          );
        })}
      </div>
      <Segmented
        value={minor ? 'minor' : 'major'}
        onChange={(m) => parsed && onChange(`${parsed.tonic}${m === 'minor' ? 'm' : ''}`)}
        options={[{ value: 'major', label: t('key.major') }, { value: 'minor', label: t('key.minor') }]}
      />
    </div>
  );
}

/** Under the tempo field: tap it out, or hear it. A dot pulses at the tempo, so a wrong number is seen at once. */
export function TempoTools({ tempo, onTempo }: { tempo: string; onTempo: (bpm: string) => void }) {
  const t = useT();
  const bpm = Number(tempo);
  const valid = Number.isInteger(bpm) && bpm >= 30 && bpm <= 300;
  const { running, toggle } = useMetronome(valid ? bpm : 100, 4);
  const taps = useRef<number[]>([]);
  const tap = () => {
    taps.current = [...taps.current.slice(-5), Date.now()];
    const tapped = tapTempo(taps.current);
    if (tapped) onTempo(String(clampBpm(tapped)));
  };
  return (
    <div className="mt-2 flex items-center gap-2">
      <button type="button" onClick={tap} className="h-10 rounded-md border border-line bg-surface px-3 text-sm font-semibold transition-transform active:scale-95">
        {t('metro.tap')}
      </button>
      <button
        type="button"
        aria-pressed={running}
        disabled={!valid}
        onClick={toggle}
        className={`h-10 min-w-[5.5rem] rounded-md px-3 text-sm font-semibold transition-colors disabled:opacity-40 ${running ? 'bg-lei text-white' : 'bg-chrome text-chrome-ink'}`}
      >
        {running ? `■ ${t('metro.stop')}` : `▶ ${t('metro.start')}`}
      </button>
      {valid && (
        <span aria-hidden className="tempo-dot ml-1 h-3 w-3 rounded-full bg-io" style={{ animationDuration: `${60 / bpm}s` }} />
      )}
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A slider for the length, in 5-second steps up to 12 minutes; it edits the same m:ss text as the field above it. */
export function DurationSlider({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const t = useT();
  const [m, s] = value.split(':');
  const seconds = value.includes(':') ? (Number(m) || 0) * 60 + (Number(s) || 0) : Number(value) || 0;
  return (
    <input
      type="range"
      aria-label={t('duration.slider')}
      min={0}
      max={720}
      step={5}
      value={Math.min(720, seconds)}
      onChange={(e) => {
        const v = Number(e.target.value);
        navigator.vibrate?.(3);
        onChange(v === 0 ? '' : `${Math.floor(v / 60)}:${pad(v % 60)}`);
      }}
      className="form-range mt-2 w-full"
    />
  );
}
