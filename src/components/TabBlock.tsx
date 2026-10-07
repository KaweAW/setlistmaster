import { useEffect, useRef, useState } from 'react';
import { isTabLine } from '../core/chordpro';

/** One character of a tab line, coloured by what it is: string name, bar line, dash, fret number or playing mark. */
function Marked({ line }: { line: string }) {
  const name = /^\s*[A-Ga-g][#b♯♭]?\s*/.exec(line)?.[0] ?? '';
  const rest = line.slice(name.length);
  return (
    <span className="tab-line">
      <span className="t-str">{name}</span>
      {rest.split(/(\d+|-+|\|+|[hpbrx/\\~^()vtsS<>=*.:]+)/).map((piece, i) => {
        if (!piece) return null;
        const cls = /^\d/.test(piece) ? 't-fret' : /^-/.test(piece) ? 't-dash' : /^\|/.test(piece) ? 't-bar' : /^[hpbrx/\\~^()vtsS<>=*.:]/.test(piece) ? 't-tech' : '';
        return <span key={i} className={cls}>{piece}</span>;
      })}
    </span>
  );
}

/**
 * Tablature as it is meant to be read: each staff (the run of string lines) in its own strip that scrolls sideways instead of
 * wrapping, with fret numbers bold and in colour, dashes faded, bar lines marked, and playing marks (h, p, b, /, ~…) picked
 * out. A small arrow shows when there is more to the right. Other lines (captions, "x2") stay as plain text above or below.
 */
export function TabBlock({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const staves: { tab: boolean; lines: string[] }[] = [];
  for (const line of lines) {
    const tab = isTabLine(line);
    const last = staves[staves.length - 1];
    if (last && last.tab === tab && (tab || line.trim() !== '')) last.lines.push(line);
    else if (tab || line.trim() !== '') staves.push({ tab, lines: [line] });
  }
  return (
    <>
      {staves.map((s, i) =>
        s.tab ? <Staff key={i} lines={s.lines} /> : <p key={i} className="my-1 whitespace-pre-wrap text-[0.85em] text-soft">{s.lines.join('\n')}</p>,
      )}
    </>
  );
}

function Staff({ lines }: { lines: string[] }) {
  const box = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const check = () => setMore(el.scrollWidth - el.scrollLeft - el.clientWidth > 4);
    check();
    el.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      el.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [lines]);
  return (
    <div ref={box} className="tab-staff" {...(more ? { 'data-more': '' } : {})}>
      <div ref={strip} className="tab-scroll" tabIndex={0} aria-label="Tab">
        {lines.map((l, i) => <Marked key={i} line={l} />)}
      </div>
    </div>
  );
}
