import { parseChord } from './chords';
import type { Frets } from './fingerings';

/**
 * Ready-made guitar fingerings (standard tuning, low E first) for the chords most songs use, so a diagram can be shown even
 * when the text does not spell the fingering out. Open shapes where the chord has a common one, otherwise a barre:
 * the "E shape" with the root on the 6th string or the "A shape" with the root on the 5th, whichever sits lower on the neck.
 * Anything more exotic returns null: no diagram is better than a wrong one.
 */

type Quality = '' | 'm' | '7' | 'm7' | 'maj7' | 'sus2' | 'sus4' | '6' | 'm6' | '9' | 'add9' | '5' | 'm7b5' | 'dim7';

const QUALITY: Record<string, Quality> = {
  '': '', M: '', maj: '',
  m: 'm', min: 'm', '-': 'm',
  '7': '7', dom7: '7',
  m7: 'm7', min7: 'm7', '-7': 'm7',
  maj7: 'maj7', M7: 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7', ma7: 'maj7',
  sus2: 'sus2', sus: 'sus4', sus4: 'sus4',
  '6': '6', m6: 'm6', min6: 'm6',
  '9': '9', add9: 'add9', add2: 'add9', '2': 'add9',
  '5': '5',
  m7b5: 'm7b5', 'm7(b5)': 'm7b5', 'ø': 'm7b5', 'ø7': 'm7b5',
  dim7: 'dim7', '°7': 'dim7', dim: 'dim7', '°': 'dim7',
};

const PITCH: Record<string, number> = {
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, 'E#': 5, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
};

const x = -1;

/** Open shapes, by pitch class of the root and quality. */
const OPEN: Partial<Record<number, Partial<Record<Quality, Frets>>>> = {
  0: { '': [x, 3, 2, 0, 1, 0], '7': [x, 3, 2, 3, 1, 0], maj7: [x, 3, 2, 0, 0, 0], add9: [x, 3, 2, 0, 3, 0], sus2: [x, 3, 0, 0, 1, 3], sus4: [x, 3, 3, 0, 1, 1], '6': [x, 3, 2, 2, 1, 0], '5': [x, 3, 5, 5, x, x] },
  2: { '': [x, x, 0, 2, 3, 2], m: [x, x, 0, 2, 3, 1], '7': [x, x, 0, 2, 1, 2], m7: [x, x, 0, 2, 1, 1], maj7: [x, x, 0, 2, 2, 2], sus2: [x, x, 0, 2, 3, 0], sus4: [x, x, 0, 2, 3, 3], '6': [x, x, 0, 2, 0, 2], m6: [x, x, 0, 2, 0, 1], '5': [x, x, 0, 2, 3, x] },
  4: { '': [0, 2, 2, 1, 0, 0], m: [0, 2, 2, 0, 0, 0], '7': [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0], maj7: [0, 2, 1, 1, 0, 0], sus4: [0, 2, 2, 2, 0, 0], '5': [0, 2, 2, x, x, x], '6': [0, 2, 2, 1, 2, 0], m6: [0, 2, 2, 0, 2, 0], add9: [0, 2, 2, 1, 0, 2], '9': [0, 2, 0, 1, 0, 2] },
  5: { maj7: [x, x, 3, 2, 1, 0] },
  7: { '': [3, 2, 0, 0, 0, 3], '7': [3, 2, 0, 0, 0, 1], maj7: [3, 2, 0, 0, 0, 2], '6': [3, 2, 0, 0, 0, 0], sus4: [3, 3, 0, 0, 1, 3], add9: [3, x, 0, 2, 0, 3], '5': [3, 5, 5, x, x, x] },
  9: { '': [x, 0, 2, 2, 2, 0], m: [x, 0, 2, 2, 1, 0], '7': [x, 0, 2, 0, 2, 0], m7: [x, 0, 2, 0, 1, 0], maj7: [x, 0, 2, 1, 2, 0], sus2: [x, 0, 2, 2, 0, 0], sus4: [x, 0, 2, 2, 3, 0], '6': [x, 0, 2, 2, 2, 2], m6: [x, 0, 2, 2, 1, 2], '5': [x, 0, 2, 2, x, x], add9: [x, 0, 2, 4, 2, 0], '9': [x, 0, 2, 4, 2, 3] },
  11: { '7': [x, 2, 1, 2, 0, 2] },
};

/** Barre shapes as offsets from the barre fret r; null where the shape has no usable form. */
const E_SHAPE: Partial<Record<Quality, (number | null)[]>> = {
  '': [0, 2, 2, 1, 0, 0], m: [0, 2, 2, 0, 0, 0], '7': [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0],
  maj7: [0, null, 1, 1, 0, null], sus4: [0, 2, 2, 2, 0, 0], '5': [0, 2, 2, null, null, null],
  m7b5: [0, null, 0, 0, -1, null], dim7: [0, null, -1, 0, -1, null],
};
const A_SHAPE: Partial<Record<Quality, (number | null)[]>> = {
  '': [null, 0, 2, 2, 2, 0], m: [null, 0, 2, 2, 1, 0], '7': [null, 0, 2, 0, 2, 0], m7: [null, 0, 2, 0, 1, 0],
  maj7: [null, 0, 2, 1, 2, 0], sus2: [null, 0, 2, 2, 0, 0], sus4: [null, 0, 2, 2, 3, 0], '6': [null, 0, 2, 2, 2, 2],
  m6: [null, 0, 2, 2, 1, 2], '9': [null, 0, -1, 0, 0, 0], '5': [null, 0, 2, 2, null, null],
  m7b5: [null, 0, 1, 0, 1, null], dim7: [null, 0, 1, -1, 1, null],
};

function place(shape: (number | null)[] | undefined, fret: number): Frets | null {
  if (!shape || fret < 1) return null;
  const frets = shape.map((o) => (o === null ? -1 : fret + o));
  return frets.every((n) => n === -1 || n >= 1) ? frets : null;
}

/** The pitch class (0 = C) of a note name, or null. */
const pitchOf = (note: string): number | null => PITCH[note.replace('♯', '#').replace('♭', 'b')] ?? null;

/** A guitar fingering for the chord, or null when there is no common one. A bass note ("G/B") is left out of the shape. */
export function shapeFor(chord: string): Frets | null {
  const parsed = parseChord(chord.trim());
  if (!parsed) return null;
  const root = pitchOf(parsed.root);
  const quality = QUALITY[parsed.suffix] ?? QUALITY[parsed.suffix.replace(/[()]/g, '')];
  if (root === null || quality === undefined) return null;

  const open = OPEN[root]?.[quality];
  if (open) return [...open];

  const eFret = (root - 4 + 12) % 12 || 12;
  const aFret = (root - 9 + 12) % 12 || 12;
  const candidates = [place(E_SHAPE[quality], eFret), place(A_SHAPE[quality], aFret)].filter((f): f is Frets => f !== null);
  if (candidates.length === 0) return null;
  const lowest = (f: Frets) => Math.min(...f.filter((n) => n > 0));
  return candidates.sort((a, b) => lowest(a) - lowest(b))[0]!;
}
