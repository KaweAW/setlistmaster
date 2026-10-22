import { chartChords, type ParsedChart } from './chordpro';
import { shapeFor } from './chordShapes';
import { extractFingerings, type BadFingering, type Frets } from './fingerings';

export interface DiagramEntry {
  /** The chord as shown (transposed when the sheet is). */
  name: string;
  /** null: no fingering known for it. */
  frets: Frets | null;
  /** True when the fingering comes from the text (written by the band), false for a ready-made shape. */
  written: boolean;
}

export interface ChartDiagrams {
  entries: DiagramEntry[];
  /** Fingering lines that could not be read (to tell the writer). */
  bad: BadFingering[];
  /** How many fingerings the text spells out. */
  writtenCount: number;
  lookup: (name: string) => DiagramEntry;
}

/**
 * The chord diagrams of a sheet: the fingerings written in the text first, in their order, then a ready-made shape for every
 * other chord the song uses. Once the sheet is transposed (or the capo moved) the written fingerings no longer match the
 * chords shown, so only ready-made shapes are used.
 */
export function chartDiagrams(text: string, chart: ParsedChart, show: (chord: string) => string, shifted: boolean): ChartDiagrams {
  const scan = extractFingerings(text);
  const entries: DiagramEntry[] = [];
  const byName = new Map<string, DiagramEntry>();
  const add = (entry: DiagramEntry) => {
    if (byName.has(entry.name)) return;
    byName.set(entry.name, entry);
    entries.push(entry);
  };
  if (!shifted) scan.defs.forEach((d) => add({ name: d.name, frets: d.frets, written: true }));
  for (const chord of chartChords(chart)) {
    const name = show(chord);
    if (byName.has(name)) continue;
    add({ name, frets: shapeFor(name), written: false });
  }
  const lookup = (name: string): DiagramEntry => byName.get(name) ?? { name, frets: (!shifted && scan.map.get(name)) || shapeFor(name), written: !shifted && scan.map.has(name) };
  return { entries, bad: scan.bad, writtenCount: scan.defs.length, lookup };
}
