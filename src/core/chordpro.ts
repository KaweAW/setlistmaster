import ChordSheetJS from 'chordsheetjs';

const { ChordProParser, ChordLyricsPair, Tag, Comment, Literal } = ChordSheetJS;

/** A chord and the lyrics that follow it (until the next chord). */
export interface ChordSegment {
  chord: string | null;
  lyrics: string;
}

export type SectionKind = 'intro' | 'verse' | 'prechorus' | 'chorus' | 'bridge' | 'instrumental' | 'outro' | 'tab' | 'none';

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
  const n = name.toLowerCase();
  if (/pre[-_ ]?(chorus|ritornello)/.test(n)) return 'prechorus';
  if (n.includes('chorus')) return 'chorus';
  if (n.includes('verse')) return 'verse';
  if (n.includes('bridge')) return 'bridge';
  if (n.includes('tab')) return 'tab';
  if (n.includes('intro')) return 'intro';
  if (n.includes('outro')) return 'outro';
  if (/instrumental|solo|interlude/.test(n)) return 'instrumental';
  return 'none';
};

/** The section a heading such as "Verse 2", "Pre-Chorus", "Ritornello" or "Instrumental Break" stands for (English and Italian), or null. */
export function sectionKindOfLabel(label: string): InsertableKind | null {
  const n = label.toLowerCase().replace(/[^a-zàèéìòù ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) return null;
  if (/^(pre ?chorus|prechorus|pre ?ritornello|pre ?inciso)\b/.test(n)) return 'prechorus';
  if (/^(post ?chorus|chorus|ritornello|refrain|hook|inciso)\b/.test(n)) return 'chorus';
  if (/^(verse|strofa|verso|versi)\b/.test(n)) return 'verse';
  if (/^(bridge|ponte)\b/.test(n)) return 'bridge';
  if (/^(intro|introduzione)\b/.test(n)) return 'intro';
  if (/^(outro|finale|coda|ending|tag)\b/.test(n)) return 'outro';
  if (/^(solo|assolo|instrumental|strumentale|interlude|interludio|break|riff)\b/.test(n)) return 'instrumental';
  if (/^tab\b/.test(n)) return 'tab';
  return null;
}

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

/** The ChordPro environment name of each kind that can be written by hand. */
export const SECTION_TAGS = {
  intro: 'intro', verse: 'verse', prechorus: 'prechorus', chorus: 'chorus', bridge: 'bridge',
  instrumental: 'instrumental', outro: 'outro', tab: 'tab',
} as const;
export type InsertableKind = keyof typeof SECTION_TAGS;

/** Inserts an empty section ({start_of_verse: Verse} … {end_of_verse}) on its own lines at the cursor; the cursor lands inside it. */
export function insertSection(source: string, cursor: number, kind: InsertableKind, label: string): { text: string; cursor: number } {
  const at = Math.max(0, Math.min(cursor, source.length));
  const lineStart = source.lastIndexOf('\n', at - 1) + 1;
  const open = `{start_of_${SECTION_TAGS[kind]}${label ? `: ${label}` : ''}}\n`;
  const close = `{end_of_${SECTION_TAGS[kind]}}\n`;
  const needsBreak = lineStart < source.length && source.slice(lineStart).trim() !== '' ? '\n' : '';
  const text = `${source.slice(0, lineStart)}${open}\n${close}${needsBreak}${source.slice(lineStart)}`;
  return { text, cursor: lineStart + open.length };
}

const HEADING_WORD = /^(?:pre-?chorus|post-?chorus|chorus|verse|verso|versi|bridge|intro|introduzione|outro|solo|interlude|interludio|instrumental|strumentale|refrain|hook|coda|tag|break|riff|strofa|ritornello|inciso|ponte|finale|assolo|ending|tab)\b/i;

/** The text of a heading line ("[Verse 1]", "Chorus:", "**Bridge**", "## Outro", "{comment: Solo}") or null when the line is something else. */
function headingOf(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || /^\{(start|end)_of_/i.test(trimmed)) return null;
  const comment = /^\{(?:comment|c|ci|cb):\s*([^}]+)\}$/i.exec(trimmed);
  if (comment) return HEADING_WORD.test(comment[1]!.trim()) ? comment[1]!.trim() : null;
  if (trimmed.startsWith('{')) return null;
  const decorated = /^[#*_=\-\s]*(?:\[([^\]]+)\]|\(([^)]+)\)|([^[\](){}]+?))[#*_=\-\s]*:?\s*$/.exec(trimmed);
  if (!decorated) return null;
  const bracketed = decorated[1] !== undefined || decorated[2] !== undefined;
  const text = (decorated[1] ?? decorated[2] ?? decorated[3] ?? '').replace(/[*_#]+/g, '').trim();
  if (!HEADING_WORD.test(text)) return null;
  // A bare word is only a heading when it is short ("Verse 2", "Chorus x2") or ends with a colon, so a lyric line is not swallowed.
  const marked = bracketed || /[*#=]/.test(trimmed) || trimmed.endsWith(':');
  if (!marked && text.split(/\s+/).length > 3) return null;
  return text.replace(/\s+/g, ' ');
}

/**
 * Splits a text into sections: every heading line ("[Verse 1]", "[Pre-Chorus]", "Chorus:", "{comment: Solo}") opens a
 * {start_of_…: Label} block that ends before the next heading. Text that already uses blocks is left as it is.
 */
export function structureSections(source: string): { text: string; count: number } {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let open: string | null = null;
  let count = 0;
  const close = () => {
    if (open === null) return;
    let trailing = 0;
    while (out.length > 0 && out[out.length - 1]!.trim() === '') { out.pop(); trailing++; }
    out.push(`{end_of_${open}}`);
    for (let i = 0; i < Math.max(1, trailing); i++) out.push('');
    open = null;
  };
  for (const line of lines) {
    const heading = headingOf(line);
    const kind = heading ? sectionKindOfLabel(heading) : null;
    if (heading && kind) {
      close();
      const tag = SECTION_TAGS[kind];
      out.push(`{start_of_${tag}: ${heading}}`);
      open = tag;
      count++;
    } else if (open !== null && /^\s*\{end_of_/i.test(line)) {
      // an explicit end of a block we opened: keep a single close
      close();
    } else {
      out.push(line);
    }
  }
  close();
  while (out.length > 0 && out[out.length - 1]!.trim() === '') out.pop();
  return { text: count > 0 ? `${out.join('\n')}\n` : source, count };
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

const blockKey = (lines: readonly string[]) =>
  lines.map((l) => l.replace(/\[[^\]]*\]/g, '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim()).filter(Boolean);

/** How much of the bigger block's lines the two blocks share (0–1). */
function overlap(a: readonly string[], b: readonly string[]): number {
  const set = new Set(b);
  return a.filter((l) => set.has(l)).length / Math.max(a.length, b.length, 1);
}

/**
 * A guess for text with no headings: the stanzas (separated by blank lines) that come back are the chorus, the rest are
 * verses; a short stanza at the start is the intro, at the end the outro, and one between others a bridge. Only an estimate:
 * pasting the text with its headings gives an exact split.
 */
export function guessSections(source: string): { text: string; count: number } {
  if (/\{start_of_/i.test(source)) return { text: source, count: 0 };
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    if (line.trim() === '') {
      if (current.length > 0) blocks.push(current);
      current = [];
    } else current.push(line);
  }
  if (current.length > 0) blocks.push(current);
  if (blocks.length < 2) return { text: source, count: 0 };

  const keys = blocks.map(blockKey);
  const repeated = keys.map((k, i) => k.length > 0 && keys.some((o, j) => j !== i && overlap(k, o) >= 0.7));
  let verse = 0;
  let bridge = false;
  const out: string[] = [];
  blocks.forEach((block, i) => {
    const short = block.length <= 2 && !repeated[i];
    let kind: InsertableKind;
    let label: string;
    if (repeated[i]) [kind, label] = ['chorus', 'Chorus'];
    else if (short && i === 0 && blocks.length >= 3) [kind, label] = ['intro', 'Intro'];
    else if (short && i === blocks.length - 1 && blocks.length >= 3) [kind, label] = ['outro', 'Outro'];
    else if (short && i > 0 && !bridge && blocks.length >= 4) {
      bridge = true;
      [kind, label] = ['bridge', 'Bridge'];
    } else {
      verse++;
      [kind, label] = ['verse', `Verse ${verse}`];
    }
    out.push(`{start_of_${SECTION_TAGS[kind]}: ${label}}`, ...block, `{end_of_${SECTION_TAGS[kind]}}`, '');
  });
  return { text: `${out.join('\n').trimEnd()}\n`, count: blocks.length };
}
