import { isChord } from './chords';

/**
 * Converts text pasted in the "chords above the words" layout (Ultimate Guitar style) to ChordPro.
 * Own implementation on purpose: chord detection is strict (see chords.ts), so lyrics such as "La la la"
 * or "Bad" are never mistaken for chords, which general-purpose parsers do (solfège names, for instance).
 */
const SECTION_WORDS =
  'intro|verse|chorus|pre-?chorus|post-?chorus|bridge|outro|solo|interlude|instrumental|refrain|hook|coda|tag|break|riff|' +
  'strofa|ritornello|inciso|ponte|finale|introduzione|assolo|ripresa';
const SECTION_ONLY = new RegExp(`^\\s*[\\[(]?\\s*(?:${SECTION_WORDS})\\b[^\\]\\n):]*[\\])]?\\s*:?\\s*$`, 'i');
const SECTION_THEN_CHORDS = new RegExp(`^\\s*[\\[(]?\\s*((?:${SECTION_WORDS})\\b[^\\]\\n):]*)[\\])]?\\s*:\\s*(\\S.*)$`, 'i');
const BRACKET_LABEL = /^\s*\[([^\]]+)\]\s*:?\s*$/;
const FILLER = /^(\||\|\||\/|-|%|x\d+|\(x\d+\)|\(?x\d+\)?)$/i;
const NO_CHORD = /^N\.?C\.?$/i;

const isChordToken = (token: string) => isChord(token) || NO_CHORD.test(token) || FILLER.test(token);
const isRealChord = (token: string) => isChord(token) || NO_CHORD.test(token);

/** A line made only of chords (and bar/repeat marks), with at least one chord. */
function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every(isChordToken) && tokens.some(isRealChord);
}

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

const chordsOnly = (chordLine: string) =>
  chordLine.trim().split(/\s+/).filter(isRealChord).map((c) => `[${c}]`).join(' ');

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

    if (isChordLine(line)) {
      const next = lines[i + 1];
      const nextIsLyric = next !== undefined && next.trim() !== '' && !isChordLine(next) && labelOf(next) === null;
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
