import { isChord } from './chords';

/**
 * Converts text pasted in the "chords above the words" layout (Ultimate Guitar style) to ChordPro.
 * Own implementation on purpose: chord detection is strict (see chords.ts), so lyrics such as "La la la"
 * or "Bad" are never mistaken for chords, which general-purpose parsers do (solfège names, for instance).
 */
const SECTION_WORDS =
  'intro|verse|chorus|pre-?chorus|post-?chorus|bridge|outro|solo|interlude|instrumental|refrain|hook|coda|tag|break|riff|' +
  'strofa|verso|versi|ritornello|inciso|ponte|finale|introduzione|assolo|ripresa';
const SECTION_ONLY = new RegExp(`^\\s*[\\[(]?\\s*(?:${SECTION_WORDS})\\b[^\\]\\n):]*[\\])]?\\s*:?\\s*$`, 'i');
const SECTION_THEN_CHORDS = new RegExp(`^\\s*[\\[(]?\\s*((?:${SECTION_WORDS})\\b[^\\]\\n):]*)[\\])]?\\s*:\\s*(\\S.*)$`, 'i');
const BRACKET_LABEL = /^\s*\[([^\]]+)\]\s*:?\s*$/;
const DIRECTIVE = /^\s*\{[^}]*\}\s*$/;
const FILLER = /^(\||\|\||\/|-|%|x\d+|\(x\d+\)|\(?x\d+\)?)$/i;
const NO_CHORD = /^N\.?C\.?$/i;

export const isChordToken = (token: string) => isChord(token) || NO_CHORD.test(token) || FILLER.test(token);
export const isRealChord = (token: string) => isChord(token) || NO_CHORD.test(token);

/**
 * The words of a line, with a remark in brackets kept as one piece: "A  D  x2  (single strums)" gives
 * ["A", "D", "x2", "(single strums)"]. Remarks are how chord lines carry playing hints (as in Cifra).
 */
function piecesOf(line: string): string[] {
  const out: string[] = [];
  let note: string[] | null = null;
  for (const token of line.trim().split(/\s+/).filter(Boolean)) {
    if (note) {
      note.push(token);
      if (token.endsWith(')')) {
        out.push(note.join(' '));
        note = null;
      }
    } else if (token.startsWith('(') && !FILLER.test(token)) {
      if (token.endsWith(')')) out.push(token);
      else note = [token];
    } else out.push(token);
  }
  if (note) out.push(note.join(' '));
  return out;
}
const isRemark = (piece: string) => piece.startsWith('(') && !FILLER.test(piece);

/** A line made only of chords (and bar/repeat marks, and remarks in brackets), with at least one chord. */
export function isChordLine(line: string): boolean {
  const pieces = piecesOf(line);
  return pieces.length > 0 && pieces.every((p) => isChordToken(p) || isRemark(p)) && pieces.some(isRealChord);
}

/** A line that is only a remark in brackets, such as "(hold)" or "(let ring)": a playing hint, not words to sing. */
const isRemarkLine = (line: string) => /^\s*\([^()]*\)\s*$/.test(line) && !FILLER.test(line.trim());

const escapeLyrics = (text: string) => text.replace(/([[\]{}])/g, '\\$1');

function mergeChordsIntoLyrics(chordLine: string, lyric: string): string {
  const placements = [...chordLine.matchAll(/\S+/g)]
    .filter((m) => isRealChord(m[0]))
    .map((m) => ({ at: Math.min(m.index ?? 0, lyric.length), chord: m[0] }));
  let out = '';
  let last = 0;
  for (const { at, chord } of placements) {
    out += `${escapeLyrics(lyric.slice(last, at))}[${chord}]`;
    last = at;
  }
  return out + escapeLyrics(lyric.slice(last));
}

/** A chord line with no words under it: the chords, and the repeat marks and remarks as they were written ("x4"). */
const chordsOnly = (chordLine: string) =>
  piecesOf(chordLine).map((p) => (isRealChord(p) || FILLER.test(p) ? `[${p}]` : escapeLyrics(p))).join(' ');

function labelOf(line: string): string | null {
  if (SECTION_ONLY.test(line)) return line.replace(/^[\s[(]+|[\s\]):]+$/g, '');
  const bracket = BRACKET_LABEL.exec(line);
  if (bracket && !isChordLine(bracket[1]!)) return bracket[1]!.trim();
  return null;
}

export function chordsOverWordsToChordPro(input: string): string {
  const lines = input.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n').map((l) => l.trimEnd());
  const out: string[] = [];
  const comment = (text: string) => out.push(`{comment: ${text}}`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === '') {
      out.push('');
      continue;
    }

    if (DIRECTIVE.test(line)) {
      out.push(line.trim()); // already ChordPro ({start_of_verse}, {comment: …}): left as it is
      continue;
    }

    const labelWithChords = SECTION_THEN_CHORDS.exec(line);
    if (labelWithChords && isChordLine(labelWithChords[2]!)) {
      comment(labelWithChords[1]!.trim());
      out.push(chordsOnly(labelWithChords[2]!));
      continue;
    }
    const label = isChordLine(line) ? null : labelOf(line);
    if (label !== null) {
      comment(label);
      continue;
    }

    if (isRemarkLine(line)) {
      comment(line.trim());
      continue;
    }

    if (isChordLine(line)) {
      const next = lines[i + 1];
      const nextIsLyric = next !== undefined && next.trim() !== '' && !DIRECTIVE.test(next) && !isChordLine(next) && !isRemarkLine(next) && labelOf(next) === null;
      if (nextIsLyric) {
        out.push(mergeChordsIntoLyrics(line, next));
        i += 1;
      } else {
        out.push(chordsOnly(line));
      }
      continue;
    }

    out.push(escapeLyrics(line.trim() === line ? line : line.trimStart()));
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** True for text in the "chords above the words" layout: lines of bare chords and no [chord] marks yet. */
export function looksLikeChordsOverWords(text: string): boolean {
  // "[Am]" marks mean ChordPro; a heading in brackets ("[Bass Intro x4]") does not.
  if ([...text.matchAll(/\[([^\]\n]+)\]/g)].some((m) => isRealChord(m[1]!.trim()))) return false;
  // One line of bare chords is enough: read as ChordPro, "F#m C#" would lose everything after the # (a comment there).
  return text.split(/\r?\n/).some((l) => l.trim() !== '' && isChordLine(l));
}
