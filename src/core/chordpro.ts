import ChordSheetJS from 'chordsheetjs';

const { ChordProParser, ChordLyricsPair, Tag, Comment, Literal } = ChordSheetJS;

/** A chord and the lyrics that follow it (until the next chord). */
export interface ChordSegment {
  chord: string | null;
  lyrics: string;
}

export type SectionKind = 'verse' | 'chorus' | 'bridge' | 'tab' | 'none';

export type ChartLine =
  | { kind: 'lyrics'; section: SectionKind; segments: ChordSegment[] }
  /** Section start ({start_of_chorus}): `text` is the optional label, empty when none was given. */
  | { kind: 'label'; section: SectionKind; text: string }
  | { kind: 'comment'; text: string }
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
        else produced = true; // end_of_*, page/column breaks, other directives: nothing to show
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
