import ChordSheetJS from 'chordsheetjs';

const { ChordProParser, ChordLyricsPair, Tag, Comment, Literal } = ChordSheetJS;

/** A chord and the lyrics that follow it (until the next chord). */
export interface ChordSegment {
  chord: string | null;
  lyrics: string;
}

export type SectionKind = 'verse' | 'chorus' | 'bridge' | 'tab' | 'none';

/** Colours of the sticky notes written in the text with `{note: …}` or `{note_pink: …}`. */
export const NOTE_COLORS = ['yellow', 'pink', 'green', 'blue', 'orange'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

const NOTE_TAG = new RegExp(`^note(?:_(${NOTE_COLORS.join('|')}))?$`);

/** The directive line for a note. The text is kept on one line and cannot contain the closing brace. */
export function noteDirective(color: NoteColor, text: string): string {
  const clean = text.replace(/[\r\n]+/g, ' ').replace(/[{}]/g, '').trim();
  return color === 'yellow' ? `{note: ${clean}}` : `{note_${color}: ${clean}}`;
}

/** Puts a note on its own line just before the line the cursor is on (or at the end for an empty text). Returns the new text and where the cursor goes. */
export function insertNote(source: string, cursor: number, color: NoteColor, text: string): { text: string; cursor: number } {
  const note = noteDirective(color, text);
  if (source === '') return { text: note, cursor: note.length };
  const at = Math.max(0, Math.min(cursor, source.length));
  const lineStart = source.lastIndexOf('\n', at - 1) + 1;
  const next = `${source.slice(0, lineStart)}${note}\n${source.slice(lineStart)}`;
  return { text: next, cursor: lineStart + note.length + 1 };
}

export type ChartLine =
  | { kind: 'lyrics'; section: SectionKind; segments: ChordSegment[] }
  /** Section start ({start_of_chorus}): `text` is the optional label, empty when none was given. */
  | { kind: 'label'; section: SectionKind; text: string }
  | { kind: 'comment'; text: string }
  /** A sticky note: a reminder for the players, shown in colour among the lyrics. */
  | { kind: 'note'; color: NoteColor; text: string }
  | { kind: 'tab'; text: string }
  | { kind: 'blank' };

export interface ParsedChart {
  title?: string;
  artist?: string;
  key?: string;
  lines: ChartLine[];
}

const sectionOf = (name: string): SectionKind => {
  if (name.includes('chorus')) return 'chorus';
  if (name.includes('verse')) return 'verse';
  if (name.includes('bridge')) return 'bridge';
  if (name.includes('tab')) return 'tab';
  return 'none';
};

type ParsedSong = ReturnType<InstanceType<typeof ChordProParser>['parse']>;

function build(song: ParsedSong): ParsedChart {
  const chart: ParsedChart = { lines: [] };
  const lines: ChartLine[] = [];

  for (const line of song.lines) {
    const section = sectionOf(String(line.type));
    const segments: ChordSegment[] = [];
    let produced = false;

    for (const item of line.items) {
      if (item instanceof ChordLyricsPair) {
        segments.push({ chord: item.chords ? item.chords : null, lyrics: item.lyrics ?? '' });
      } else if (item instanceof Tag) {
        const name = String(item.name);
        const value = String(item.value ?? '').trim();
        if (name.startsWith('start_of_')) {
          lines.push({ kind: 'label', section: sectionOf(name), text: value });
          produced = true;
        } else if (name === 'comment' || name === 'comment_italic' || name === 'comment_box') {
          if (value) lines.push({ kind: 'comment', text: value });
          produced = true;
        } else if (name === 'title') chart.title = value;
        else if (name === 'artist') chart.artist = value;
        else if (name === 'key') chart.key = value;
        else if (NOTE_TAG.test(name)) {
          if (value) lines.push({ kind: 'note', color: (NOTE_TAG.exec(name)![1] as NoteColor | undefined) ?? 'yellow', text: value });
          produced = true;
        } else produced = true; // end_of_*, page/column breaks, other directives: nothing to show
      } else if (item instanceof Literal) {
        lines.push({ kind: 'tab', text: item.string });
        produced = true;
      } else if (item instanceof Comment) {
        produced = true; // "# note" lines are not shown
      }
    }

    if (segments.length > 0) {
      const empty = segments.every((s) => !s.chord && !s.lyrics.trim());
      lines.push(empty ? { kind: 'blank' } : { kind: 'lyrics', section, segments });
    } else if (!produced && line.items.length === 0) {
      lines.push({ kind: 'blank' });
    }
  }

  chart.lines = tidyBlanks(lines);
  return chart;
}

/** No leading or trailing blank lines, and never more than one blank line in a row. */
function tidyBlanks(lines: ChartLine[]): ChartLine[] {
  const out: ChartLine[] = [];
  for (const line of lines) {
    if (line.kind === 'blank' && (out.length === 0 || out[out.length - 1]!.kind === 'blank')) continue;
    out.push(line);
  }
  while (out.length > 0 && out[out.length - 1]!.kind === 'blank') out.pop();
  return out;
}

/**
 * Reads ChordPro text. Never throws: the editor lets people type half-finished text
 * ("[Am" without the closing bracket), and a line that cannot be read is shown as plain lyrics.
 */
export function parseChordPro(text: string): ParsedChart {
  try {
    return build(new ChordProParser().parse(text));
  } catch {
    const lines: ChartLine[] = [];
    for (const raw of text.split(/\r?\n/)) {
      try {
        lines.push(...build(new ChordProParser().parse(raw)).lines);
      } catch {
        lines.push({ kind: 'lyrics', section: 'none', segments: [{ chord: null, lyrics: raw }] });
      }
      if (raw.trim() === '') lines.push({ kind: 'blank' });
    }
    return { lines: tidyBlanks(lines) };
  }
}

/** Every chord that appears in the chart, in order (used to guess the key). */
export function chartChords(chart: ParsedChart): string[] {
  return chart.lines.flatMap((line) =>
    line.kind === 'lyrics' ? line.segments.flatMap((s) => (s.chord ? [s.chord] : [])) : [],
  );
}

export interface ChartSection {
  /** Index of the section in the chart (0-based): the same one ChordChart puts in `data-section`. */
  index: number;
  kind: SectionKind;
  /** The label written in the text, or '' when the section has none. */
  text: string;
}

/**
 * Splits a chart into its sections: each starts at a label line ({start_of_verse: Verse 1}); anything before the first
 * label is a section with no label. The label line itself is the first line of its section.
 */
export function chartSections(chart: ParsedChart): { section: ChartSection; lines: ChartLine[] }[] {
  const out: { section: ChartSection; lines: ChartLine[] }[] = [];
  for (const line of chart.lines) {
    if (line.kind === 'label' || out.length === 0) {
      out.push({
        section: { index: out.length, kind: line.kind === 'label' ? line.section : 'none', text: line.kind === 'label' ? line.text : '' },
        lines: [line],
      });
    } else {
      out[out.length - 1]!.lines.push(line);
    }
  }
  return out.filter((x) => x.lines.some((l) => l.kind !== 'blank'));
}

const kindOfTag = { verse: 'verse', chorus: 'chorus', bridge: 'bridge', tab: 'tab' } as const;

/** Inserts an empty section ({start_of_verse: Verse} … {end_of_verse}) on its own lines at the cursor; the cursor lands inside it. */
export function insertSection(source: string, cursor: number, kind: keyof typeof kindOfTag, label: string): { text: string; cursor: number } {
  const at = Math.max(0, Math.min(cursor, source.length));
  const lineStart = source.lastIndexOf('\n', at - 1) + 1;
  const open = `{start_of_${kindOfTag[kind]}${label ? `: ${label}` : ''}}\n`;
  const close = `{end_of_${kindOfTag[kind]}}\n`;
  const needsBreak = lineStart < source.length && source.slice(lineStart).trim() !== '' ? '\n' : '';
  const text = `${source.slice(0, lineStart)}${open}\n${close}${needsBreak}${source.slice(lineStart)}`;
  return { text, cursor: lineStart + open.length };
}

/** Puts `[chord]` at the cursor, replacing a selection. */
export function insertChord(source: string, start: number, end: number, chord: string): { text: string; cursor: number } {
  const a = Math.max(0, Math.min(start, source.length));
  const b = Math.max(a, Math.min(end, source.length));
  const piece = `[${chord}]`;
  return { text: source.slice(0, a) + piece + source.slice(b), cursor: a + piece.length };
}

/** Lines of text and chords written, for the little counter under the editor. */
export function chartStats(source: string): { lines: number; chords: number } {
  const lines = source.split(/\r?\n/).filter((l) => l.trim() !== '' && !/^\s*\{.*\}\s*$/.test(l)).length;
  const chords = (source.match(/\[[^\]\n]+\]/g) ?? []).length;
  return { lines, chords };
}
