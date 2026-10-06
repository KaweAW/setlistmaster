import type { CSSProperties } from 'react';
import { transposeChord, type Accidentals } from '../core/chords';
import type { ChartLine, ParsedChart, SectionKind } from '../core/chordpro';
import { useT, type MessageKey } from '../i18n';

const SECTION_LABELS: Partial<Record<SectionKind, MessageKey>> = {
  chorus: 'chart.chorus',
  bridge: 'chart.bridge',
  tab: 'chart.tab',
};

/**
 * Chords above the words (Ultimate Guitar style). Each chord sits over the syllable it belongs to;
 * long lines wrap instead of scrolling sideways, so a swipe is never confused with a scroll.
 */
export function ChordChart({
  chart,
  semitones,
  accidentals,
  fontSize,
  stage = false,
}: {
  chart: ParsedChart;
  semitones: number;
  accidentals: Accidentals;
  fontSize: number;
  /** On stage the chords become bold pills and sections get more air, to read at arm's length. */
  stage?: boolean;
}) {
  const t = useT();
  const show = (chord: string) => transposeChord(chord, semitones, accidentals);

  const renderLine = (line: ChartLine, index: number) => {
    switch (line.kind) {
      case 'blank':
        return <div key={index} className="h-[0.9em]" />;
      case 'comment':
        return <p key={index} className="my-2 text-[0.8em] italic text-soft">{line.text}</p>;
      case 'note':
        return (
          <p key={index} className={`sticky-note sticky-note--${line.color}`} style={{ '--tilt': index % 2 ? '0.9deg' : '-0.8deg' } as CSSProperties}>
            <span className="sr-only">{t('note.label')}: </span>
            {line.text}
          </p>
        );
      case 'tab':
        return <pre key={index} className="overflow-x-auto font-mono text-[0.75em] leading-tight">{line.text}</pre>;
      case 'label': {
        const labelKey = SECTION_LABELS[line.section];
        const text = line.text || (labelKey ? t(labelKey) : '');
        return text ? (
          <h3 key={index} className={`mb-1 ${stage ? 'mt-8' : 'mt-5'} font-display text-[0.75em] font-bold uppercase tracking-widest text-soft`}>{text}</h3>
        ) : null;
      }
      case 'lyrics': {
        const hasChords = line.segments.some((s) => s.chord);
        const accent = line.section === 'chorus' ? 'border-l-4 border-coro/40 pl-3' : '';
        if (!hasChords) {
          const text = line.segments.map((s) => s.lyrics).join('');
          return <div key={index} className={`whitespace-pre-wrap ${accent}`}>{text}</div>;
        }
        return (
          <div key={index} className={`flex flex-wrap ${accent}`}>
            {line.segments.map((segment, i) => (
              <span key={i} className="inline-flex flex-col">
                <span className={`mr-[0.5em] min-h-[1.25em] whitespace-pre font-bold leading-tight text-chord ${stage ? 'chord-pill' : ''}`}>
                  {segment.chord ? show(segment.chord) : '\u00a0'}
                </span>
                <span className="whitespace-pre-wrap">{segment.lyrics === '' ? '\u00a0' : segment.lyrics}</span>
              </span>
            ))}
          </div>
        );
      }
    }
  };

  return (
    <div style={{ fontSize }} className={stage ? 'leading-normal' : 'leading-snug'}>
      {chart.lines.map(renderLine)}
    </div>
  );
}
