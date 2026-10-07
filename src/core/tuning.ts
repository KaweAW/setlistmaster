/**
 * Display format for a tuning's notes: "D-G-C-F-A-D", "D A D G B E", "eb ab db gb bb eb" all become
 * the same list of notes: ["D", "G", "C", "F", "A", "D"], with real ♯/♭ signs.
 * Free text that is not a list of notes ("Open G slide") is not parsed.
 */
const NOTE = /^([A-Ga-g])([#♯b♭]?)(\d?)$/;

export function parseTuningNotes(text: string): string[] | null {
  const tokens = text.split(/[\s\-–—,.·/]+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const notes: string[] = [];
  for (const token of tokens) {
    const match = NOTE.exec(token);
    if (match) {
      const [, letter = '', accidental = '', octave = ''] = match;
      notes.push(`${letter.toUpperCase()}${signOf(accidental)}${octave}`);
      continue;
    }
    const run = compactNotes(token);
    if (!run) return null;
    notes.push(...run);
  }
  return notes;
}

const signOf = (accidental: string) =>
  accidental === '#' || accidental === '♯' ? '♯' : accidental === 'b' || accidental === '♭' ? '♭' : '';

/** Notes written without separators: "EADGBE", "DbAbDbGbBbEb" (a lowercase b or a # right after a letter is a flat/sharp). */
function compactNotes(token: string): string[] | null {
  const notes: string[] = [];
  const pattern = /([A-G])([#♯♭]|b(?![A-G]*$)|b$)?/gy;
  let consumed = 0;
  for (let m = pattern.exec(token); m; m = pattern.exec(token)) {
    notes.push(`${m[1]}${signOf(m[2] ?? '')}`);
    consumed = pattern.lastIndex;
  }
  return notes.length > 1 && consumed === token.length ? notes : null;
}

/** Plain-text version ("D G C F A D"), for menus and lists. Unparseable text is returned as typed. */
export function formatTuningNotes(text: string): string {
  const notes = parseTuningNotes(text);
  return notes ? notes.join(' ') : text.trim();
}

/** The notes a string can be tuned to. */
export const TUNING_NOTES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] as const;

/** Standard guitar tuning, lowest string first. */
export const STANDARD_STRINGS: readonly string[] = ['E', 'A', 'D', 'G', 'B', 'E'];

/** Strings added below the sixth, in the order a 7- and an 8-string guitar get them. */
export const EXTRA_LOW_STRINGS: readonly string[] = ['B', 'F♯'];

export const MIN_STRINGS = STANDARD_STRINGS.length;
export const MAX_STRINGS = STANDARD_STRINGS.length + EXTRA_LOW_STRINGS.length;

/** Enharmonic spellings the picker offers: "C#" and "Db" are the same string. */
const SPELLED: Record<string, string> = { 'D♭': 'C♯', 'D♯': 'E♭', 'G♭': 'F♯', 'G♯': 'A♭', 'A♯': 'B♭' };
export const spellNote = (note: string): string => SPELLED[note] ?? note;

/** The strings of a tuning written as notes ("D A D G B E"), or null when the text is not a list of 4–8 notes. */
export function tuningStrings(text: string): string[] | null {
  const notes = parseTuningNotes(text)?.map((n) => spellNote(n.replace(/\d$/, '')));
  return notes && notes.length >= MIN_STRINGS && notes.length <= MAX_STRINGS ? notes : null;
}

/** A guitar with `count` strings in standard tuning (extra strings go below the lowest one). */
export function standardStrings(count = STANDARD_STRINGS.length): string[] {
  const extra = EXTRA_LOW_STRINGS.slice(0, Math.max(0, count - STANDARD_STRINGS.length)).reverse();
  return [...extra, ...STANDARD_STRINGS];
}

export const isStandardStrings = (strings: readonly string[]): boolean =>
  strings.length === STANDARD_STRINGS.length && strings.every((n, i) => n === STANDARD_STRINGS[i]);

const NAMED: Record<string, string> = {
  'D A D G B E': 'Drop D',
  'E♭ A♭ C♯ F♯ B♭ E♭': 'Half step down',
  'D G C F A D': 'Whole step down',
  'D A D F♯ A D': 'Open D',
  'D G D G B D': 'Open G',
  'D A D G A D': 'DADGAD',
};

/** A name for a tuning given as strings: "Drop D" when it is a known one, otherwise its notes. */
export function nameForStrings(strings: readonly string[]): string {
  if (isStandardStrings(strings)) return 'Standard';
  const text = strings.join(' ');
  return NAMED[text] ?? text;
}

/** The same list of notes, written one way, to compare tunings typed in different ways. */
export const stringsKey = (strings: readonly string[]): string => strings.join(' ');
