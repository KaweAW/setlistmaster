import { useEffect, useRef, type CSSProperties } from 'react';
import { transposeChord, type Accidentals } from '../core/chords';
import { chartSections, type ChartLine, type ParsedChart, type SectionKind } from '../core/chordpro';
import { calmDevice } from '../hooks/useHomeMotion';
import { isTabLine } from '../core/chordpro';
import { TabBlock } from './TabBlock';
import { elementAtReadingLine } from '../lib/readingLine';
import { useT, type MessageKey } from '../i18n';

const SECTION_LABELS: Partial<Record<SectionKind, MessageKey>> = {
  intro: 'chart.intro',
  prechorus: 'chart.prechorus',
  chorus: 'chart.chorus',
  instrumental: 'chart.instrumental',
  outro: 'chart.outro',
  bridge: 'chart.bridge',
  tab: 'chart.tab',
};

const plainText = (line: ChartLine) => (line.kind === 'lyrics' && !line.segments.some((s) => s.chord) ? line.segments.map((s) => s.lyrics).join('') : null);

/** Runs of ASCII tablature written as ordinary lines become one tab block, so tabs look right wherever they were pasted. */
function groupTabs(lines: ChartLine[]): ChartLine[] {
  const out: ChartLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    let j = i;
    const run: string[] = [];
    for (; j < lines.length; j++) {
      const text = plainText(lines[j]!);
      if (text === null || !isTabLine(text)) break;
      run.push(text);
    }
    if (run.length >= 3) {
      out.push({ kind: 'tab', text: run.join('\n') });
      i = j - 1;
    } else out.push(lines[i]!);
  }
  return out;
}

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
  onCurrentSection,
  focus = true,
}: {
  chart: ParsedChart;
  semitones: number;
  accidentals: Accidentals;
  fontSize: number;
  /** On stage the chords become bold pills and sections get more air, to read at arm's length. */
  stage?: boolean;
  /** Told which section is at reading height while the page scrolls (for the section index). */
  onCurrentSection?: (index: number) => void;
  /** Fade the sections that are not being read. Off in the editor's preview, where nothing scrolls the sheet. */
  focus?: boolean;
}) {
  const t = useT();
  const root = useRef<HTMLDivElement>(null);
  const parts = chartSections(chart);
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
        return <TabBlock key={index} text={line.text} />;
      case 'label': {
        const labelKey = SECTION_LABELS[line.section];
        const text = line.text || (labelKey ? t(labelKey) : '');
        return text ? (
          <h3 key={index} className="chart-label mb-1 font-display text-[0.75em] font-bold uppercase tracking-widest">{text}</h3>
        ) : null;
      }
      case 'lyrics': {
        const hasChords = line.segments.some((s) => s.chord);
        if (!hasChords) {
          const text = line.segments.map((s) => s.lyrics).join('');
          return <div key={index} className="whitespace-pre-wrap">{text}</div>;
        }
        return (
          <div key={index} className="flex flex-wrap">
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

  // The section at the reading line (a bit above the middle of the screen) is the one in focus; the rest fade back.
  // Near the end of the page the line slides down to the bottom edge, so the last sections, which can never reach the
  // middle, are still highlighted in turn as the page runs out.
  const count = parts.length;
  useEffect(() => {
    const el = root.current;
    if (!el || !focus || count < 2) return;
    const calm = calmDevice();
    if (!calm) el.setAttribute('data-focus', '');
    let frame = 0;
    let last = -1;
    const update = () => {
      frame = 0;
      const nodes = [...el.querySelectorAll<HTMLElement>('[data-section]')];
      if (nodes.length === 0 || el.getBoundingClientRect().height === 0) return;
      const current = elementAtReadingLine(nodes)!;
      const index = Number(current.dataset.section);
      if (index === last) return;
      last = index;
      el.querySelectorAll('[data-current]').forEach((n) => n !== current && n.removeAttribute('data-current'));
      current.setAttribute('data-current', '');
      onCurrentSection?.(index);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      el.removeAttribute('data-focus');
    };
  }, [count, chart, onCurrentSection, focus]);

  return (
    <div ref={root} style={{ fontSize }} className={`chart ${stage ? 'leading-normal' : 'leading-snug'}`}>
      {parts.map(({ section, lines }) => (
        <section
          key={section.index}
          id={`sec-${section.index}`}
          data-section={section.index}
          data-kind={section.kind}
          className={`chart-section ${stage ? 'chart-section--stage' : ''}`}
        >
          {groupTabs(lines).map((line, i) => renderLine(line, section.index * 10_000 + i))}
        </section>
      ))}
    </div>
  );
}
