import { isChord } from './chords';

/**
 * Chord fingerings written in the text of a song, the way Cifra reads them: one per line, a chord name and the fret of
 * each string from the low E to the high e ("x" or "X" for a string not played, 0 for an open one).
 *
 *     Asus   x00230
 *     F#m    2 4 4 2 2 2
 *     Ab     x 11 x 13 x x      (with a fret of 10 or more, the six values are separated by spaces)
 *
 * The ChordPro form is read too: `{define: Am base-fret 1 frets x 0 2 2 1 0}`.
 * Fingering lines are taken out of the text before the sheet is drawn; they become the chord diagrams.
 */

/** One value per string, low E first: -1 not played, 0 open, n the fret. */
export type Frets = number[];

export interface Fingering {
  name: string;
  frets: Frets;
}

/** A line that looks like a fingering but does not give six readable strings: shown to the writer, not printed. */
export interface BadFingering {
  name: string;
  text: string;
  /** How many positions were read (six are needed). */
  count: number;
}

export interface FingeringScan {
  /** In the order they were written; a name written twice keeps its last fingering. */
  defs: Fingering[];
  map: Map<string, Frets>;
  bad: BadFingering[];
  /** The text without the fingering lines. */
  body: string;
}

const STRINGS = 6;
const FRETS = /^\s*(\S+)\s+\(?\s*((?:[xX0-9]{6})|(?:(?:[xX]|\d{1,2})[\s,]+){5}(?:[xX]|\d{1,2}))\s*\)?\s*$/;
const DEFINE = /^\s*\{\s*(?:define|chord)\s*:\s*(\S+)\s+(?:base-fret\s+(\d+)\s+)?frets\s+([^}]*?)\s*(?:fingers\s+[^}]*)?\}\s*$/i;

function readFrets(text: string): Frets {
  const t = text.trim();
  const parts = /^[xX0-9]{6}$/.test(t) ? t.split('') : t.split(/[\s,]+/);
  return parts.map((p) => (/^[xXnN-]$/.test(p) || p === '-1' ? -1 : Number.parseInt(p, 10)));
}

const playable = (frets: Frets) => frets.length === STRINGS && frets.every((n) => n === -1 || (Number.isInteger(n) && n >= 0 && n <= 24));

/** Reads the fingering of one line, or null when the line is something else. */
export function fingeringOfLine(line: string): Fingering | null {
  const define = DEFINE.exec(line);
  if (define) {
    const [, name = '', base = '1', frets = ''] = define;
    const offset = Number.parseInt(base, 10) - 1;
    const values = frets.trim().split(/\s+/).map((p) => (/^[xXnN-]$/.test(p) || p === '-1' ? -1 : Number.parseInt(p, 10)));
    const absolute = values.map((n) => (n > 0 ? n + offset : n));
    return playable(absolute) ? { name, frets: absolute } : null;
  }
  const m = FRETS.exec(line);
  if (!m || !isChord(m[1]!)) return null;
  const frets = readFrets(m[2]!);
  return playable(frets) ? { name: m[1]!, frets } : null;
}

/** A chord name followed by what looks like frets, but not six of them. */
function badFingering(line: string): BadFingering | null {
  const m = /^\s*(\S+)\s+(.+)$/.exec(line);
  if (!m || !isChord(m[1]!)) return null;
  const rest = m[2]!.trim();
  const tokens = rest.split(/[\s,]+/);
  if (/^[xX0-9]{7,}$/.test(rest)) return { name: m[1]!, text: rest, count: rest.length };
  if (/^[xX0-9]{4,5}$/.test(rest) && /\d/.test(rest) && /[xX0]/.test(rest)) return { name: m[1]!, text: rest, count: rest.length };
  if (tokens.length >= 4 && tokens.length !== STRINGS && tokens.every((x) => /^(x|\d{1,2})$/i.test(x))) return { name: m[1]!, text: rest, count: tokens.length };
  return null;
}

export function extractFingerings(text: string): FingeringScan {
  const defs: Fingering[] = [];
  const map = new Map<string, Frets>();
  const bad: BadFingering[] = [];
  const body: string[] = [];
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const f = fingeringOfLine(line);
    if (f) {
      if (!map.has(f.name)) defs.push(f);
      else defs[defs.findIndex((d) => d.name === f.name)] = f;
      map.set(f.name, f.frets);
      continue;
    }
    const b = badFingering(line);
    if (b) {
      bad.push(b);
      continue;
    }
    body.push(line);
  }
  // Fingerings usually sit at the top, followed by a blank line: do not leave the sheet starting with blanks.
  while (body.length > 0 && body[0]!.trim() === '' && (defs.length > 0 || bad.length > 0)) body.shift();
  return { defs, map, bad, body: body.join('\n') };
}

/** How a fingering is written back: "x02210", or with spaces as soon as a fret has two digits. */
export const fretsText = (frets: Frets): string =>
  frets.map((n) => (n === -1 ? 'x' : String(n))).join(frets.some((n) => n > 9) ? ' ' : '');
