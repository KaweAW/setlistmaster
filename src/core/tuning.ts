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
    if (!match) return null;
    const [, letter = '', accidental = '', octave = ''] = match;
    const sign = accidental === '#' || accidental === '♯' ? '♯' : accidental === 'b' || accidental === '♭' ? '♭' : '';
    notes.push(`${letter.toUpperCase()}${sign}${octave}`);
  }
  return notes;
}

/** Plain-text version ("D G C F A D"), for menus and lists. Unparseable text is returned as typed. */
export function formatTuningNotes(text: string): string {
  const notes = parseTuningNotes(text);
  return notes ? notes.join(' ') : text.trim();
}
