import type { Frets } from '../core/fingerings';

/**
 * A guitar chord box (strings left to right from the low E). Five frets are drawn; a chord in the first five shows the nut,
 * a higher one starts at its lowest fret and writes that fret's number on the right. A finger on the same fret across
 * several strings, with nothing open or muted between them, is drawn as a barre. Geometry from Cifra.
 */
const ROWS = 5;

function geometry(frets: Frets) {
  const pressed = frets.filter((n) => n > 0);
  const max = pressed.length ? Math.max(...pressed) : 0;
  const min = pressed.length ? Math.min(...pressed) : 0;
  const base = max <= ROWS ? 1 : min;
  let barre: { fret: number; from: number; to: number } | null = null;
  if (pressed.length) {
    const at = frets.map((f, i) => (f === min ? i : -1)).filter((i) => i >= 0);
    const from = at[0]!;
    const to = at[at.length - 1]!;
    if (at.length >= 2 && to - from >= 2 && frets.slice(from, to + 1).every((f) => f >= min)) barre = { fret: min, from, to };
  }
  const rows = Math.min(7, Math.max(ROWS, max - base + 1));
  const row = (f: number) => Math.min(rows, Math.max(1, f - base + 1));
  return { base, barre, row, rows };
}

export function ChordDiagram({ frets, className, title }: { frets: Frets; className?: string; title?: string }) {
  const { base, barre, row, rows } = geometry(frets);
  const gap = 11;
  const fh = 13;
  const left = 8;
  const top = 18;
  const w = gap * 5;
  const h = fh * rows;
  return (
    <svg viewBox={`0 0 ${left + w + 20} ${top + h + 4}`} className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <rect x={left} y={top} width={w} height={h} fill="none" stroke="currentColor" strokeWidth="1" />
      {Array.from({ length: rows - 1 }, (_, r) => (
        <line key={`f${r}`} x1={left} y1={top + (r + 1) * fh} x2={left + w} y2={top + (r + 1) * fh} stroke="currentColor" strokeWidth="1" />
      ))}
      {[1, 2, 3, 4].map((i) => (
        <line key={`s${i}`} x1={left + i * gap} y1={top} x2={left + i * gap} y2={top + h} stroke="currentColor" strokeWidth="1" />
      ))}
      {base === 1 ? (
        <rect x={left - 0.5} y={top - 3.5} width={w + 1} height="4" fill="currentColor" />
      ) : (
        <text x={left + w + 6} y={top + fh * 0.5 + 3.5} fontSize="10" fill="currentColor" className="font-mono">{base}</text>
      )}
      {barre && (
        <line
          x1={left + barre.from * gap}
          y1={top + (row(barre.fret) - 0.5) * fh}
          x2={left + barre.to * gap}
          y2={top + (row(barre.fret) - 0.5) * fh}
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
        />
      )}
      {frets.map((f, i) => {
        const cx = left + i * gap;
        if (f === -1) return <path key={i} d={`M${cx - 3} ${top - 12}l6 6M${cx + 3} ${top - 12}l-6 6`} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />;
        if (f === 0) return <circle key={i} cx={cx} cy={top - 9} r="3" fill="none" stroke="currentColor" strokeWidth="1.1" />;
        if (barre && f === barre.fret && i >= barre.from && i <= barre.to) return null;
        return <circle key={i} cx={cx} cy={top + (row(f) - 0.5) * fh} r="4.6" fill="currentColor" />;
      })}
    </svg>
  );
}
