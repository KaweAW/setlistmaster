/**
 * Chord names: detection and transposition. Deliberately strict: a chord is a note A–G plus known quality
 * tokens only, so ordinary words ("Bad", "Face", "Dim", Italian "La/Do/Re") never look like chords.
 */
const ROOT = '[A-G](?:#|b|♯|♭)?';
const QUALITY = '(?:maj|min|dim|aug|sus|add|alt|no|m|M|\\+|°|ø|-|\\d+\\/\\d+|\\d+|[#b♯♭]\\d+|\\([^()\\s]*\\))*';
const CHORD_RE = new RegExp(`^(${ROOT})(${QUALITY})(?:\\/(${ROOT}))?$`);

export interface ParsedChord {
  root: string;
  /** Everything between the root and the bass note, e.g. "m7b5". */
  suffix: string;
  bass?: string;
}

export function parseChord(text: string): ParsedChord | null {
  const match = CHORD_RE.exec(text);
  if (!match) return null;
  const [, root = '', suffix = '', bass] = match;
  return bass ? { root, suffix, bass } : { root, suffix };
}

export const isChord = (text: string): boolean => parseChord(text) !== null;

const PITCH_CLASS: Record<string, number> = {
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, 'E#': 5, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
};

export type Accidentals = 'sharp' | 'flat' | 'neutral';

const NAMES: Record<Accidentals, readonly string[]> = {
  sharp: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
  flat: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
  // Keys with no accidentals (C, Am): the usual borrowed chords are flats (Bb, Eb, Ab), F# for the tritone.
  neutral: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
};

const pitchClassOf = (note: string): number => PITCH_CLASS[note.replace('♯', '#').replace('♭', 'b')] ?? 0;
const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** Transposes a chord name. Zero steps and anything that is not a chord (N.C., x2, |) are returned untouched. */
export function transposeChord(chord: string, semitones: number, accidentals: Accidentals = 'neutral'): string {
  if (mod12(semitones) === 0) return chord;
  const parsed = parseChord(chord);
  if (!parsed) return chord;
  const move = (note: string) => NAMES[accidentals][mod12(pitchClassOf(note) + semitones)]!;
  return `${move(parsed.root)}${parsed.suffix}${parsed.bass ? `/${move(parsed.bass)}` : ''}`;
}

const isMinorSuffix = (suffix: string) => /^(m(?!aj)|min)/.test(suffix);

/** Which spelling is natural in the key whose tonic is `pitchClass` (so G+1 gives Ab in Db major, G# in E major). */
function accidentalsForTonic(pitchClass: number, minor: boolean): Accidentals {
  if (minor) {
    if (pitchClass === 9) return 'neutral';
    return [2, 7, 0, 5, 3, 10].includes(pitchClass) ? 'flat' : 'sharp'; // Dm Gm Cm Fm Ebm Bbm
  }
  if (pitchClass === 0) return 'neutral';
  return [5, 10, 3, 8, 1].includes(pitchClass) ? 'flat' : 'sharp'; // F Bb Eb Ab Db
}

/** Spelling to use after moving a song in `key` by `semitones`. Unknown keys get the neutral spelling. */
export function accidentalsForKey(key: string | undefined, semitones = 0): Accidentals {
  const parsed = key ? parseChord(key.trim()) : null;
  if (!parsed) return 'neutral';
  const spelled = parsed.root.replace('♯', '#').replace('♭', 'b');
  if (mod12(semitones) === 0 && spelled.length === 2) return spelled.endsWith('b') ? 'flat' : 'sharp';
  const pc = mod12(pitchClassOf(parsed.root) + semitones);
  return accidentalsForTonic(pc, isMinorSuffix(parsed.suffix));
}

/** The key after transposing, e.g. ("Em", +3) → "Gm". Text that is not a key is returned as typed. */
export function transposeKey(key: string, semitones: number): string {
  return transposeChord(key.trim(), semitones, accidentalsForKey(key, semitones));
}

/** Best guess of the key from the first chord of a chart (songs usually start on the tonic). */
export function inferKey(chords: readonly string[]): string | undefined {
  for (const chord of chords) {
    const parsed = parseChord(chord);
    if (parsed) return `${parsed.root}${isMinorSuffix(parsed.suffix) ? 'm' : ''}`;
  }
  return undefined;
}
