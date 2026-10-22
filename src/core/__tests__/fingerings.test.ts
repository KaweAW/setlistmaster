import { describe, expect, it } from 'vitest';
import { extractFingerings, fretsText } from '../fingerings';
import { shapeFor } from '../chordShapes';
import { chartChords, parseChordPro, structureSections } from '../chordpro';
import { looksLikeChordsOverWords } from '../chordsOverWords';

const WAITING_ROOM = `F#m    24xxxx
C#     44xxxx
Ab     x 11 x 13 x x
Bm     x2443

[Bass Intro x4]
F#m C#  x4
(hold)
F#m C#  x4

[Verse 1]
F#m       C#
   I am a patient boy
F#m          C#
   I wait I wait`;

describe('fingerings written in the text', () => {
  it('reads the compact and the spaced forms, and reports a fingering with the wrong number of strings', () => {
    const scan = extractFingerings(WAITING_ROOM);
    expect(scan.defs.map((d) => [d.name, fretsText(d.frets)])).toEqual([['F#m', '24xxxx'], ['C#', '44xxxx'], ['Ab', 'x 11 x 13 x x']]);
    expect(scan.bad).toEqual([{ name: 'Bm', text: 'x2443', count: 5 }]);
    expect(scan.body.startsWith('[Bass Intro x4]')).toBe(true);
  });

  it('reads the ChordPro {define} form, frets counted from the base fret', () => {
    const scan = extractFingerings('{define: Bm base-fret 2 frets x 1 3 3 2 1}\n[Bm]Hello');
    expect(scan.map.get('Bm')).toEqual([-1, 2, 4, 4, 3, 2]);
    expect(scan.body).toBe('[Bm]Hello');
  });

  it('leaves lyrics and chord lines alone', () => {
    expect(extractFingerings('Am   C   G\nI have 2 4 6 8 friends').defs).toEqual([]);
    expect(extractFingerings('F#m C#  x4').body).toBe('F#m C#  x4');
  });
});

describe('the sheet of a text with chords above the words', () => {
  it('keeps sharps and minor chords even with a bracketed heading that is not a chord', () => {
    expect(looksLikeChordsOverWords(extractFingerings(WAITING_ROOM).body)).toBe(true);
    const chart = parseChordPro(WAITING_ROOM);
    expect(chartChords(chart).slice(0, 4)).toEqual(['F#m', 'C#', 'F#m', 'C#']);
    expect(chart.lines.some((l) => l.kind === 'lyrics' && l.segments.some((s) => s.lyrics.includes('24xxxx')))).toBe(false);
  });

  it('finds the section in a heading such as "Bass Intro x4"', () => {
    const r = structureSections('[Bass Intro x4]\nF#m C#\n\n[Guitar Solo]\nA E');
    expect(r.count).toBe(2);
    expect(r.text).toContain('{start_of_intro: Bass Intro x4}');
    expect(r.text).toContain('{start_of_instrumental: Guitar Solo}');
  });
});

describe('ready-made shapes', () => {
  it('has the open chords', () => {
    expect(fretsText(shapeFor('C')!)).toBe('x32010');
    expect(fretsText(shapeFor('Am')!)).toBe('x02210');
    expect(fretsText(shapeFor('G7')!)).toBe('320001');
    expect(fretsText(shapeFor('Dsus4')!)).toBe('xx0233');
  });
  it('makes barre chords for the others, low on the neck', () => {
    expect(fretsText(shapeFor('F')!)).toBe('133211');
    expect(fretsText(shapeFor('Bm')!)).toBe('x24432');
    expect(fretsText(shapeFor('F#m')!)).toBe('244222');
    expect(fretsText(shapeFor('C#m7')!)).toBe('x46454');
    expect(fretsText(shapeFor('Bbmaj7')!)).toBe('x13231');
  });
  it('ignores the bass note and refuses what it does not know', () => {
    expect(fretsText(shapeFor('G/B')!)).toBe('320003');
    expect(shapeFor('C13#11')).toBeNull();
    expect(shapeFor('Hello')).toBeNull();
  });
});

describe('playing hints on chord lines', () => {
  it('keeps repeat marks and remarks, and a remark line is not sung under the chords', () => {
    const chart = parseChordPro('[Intro]\nF#m C#  x4\n(hold)\nA6sus  Cadd9  X2   (single strums)\nla la');
    const text = chart.lines.map((l) => (l.kind === 'lyrics' ? l.segments.map((s) => `${s.chord ? `[${s.chord}]` : ''}${s.lyrics}`).join('') : l.kind === 'comment' ? `{${l.text}}` : '')).join('\n');
    expect(text).toContain('[F#m] [C#] [x4]');
    expect(text).toContain('{(hold)}');
    expect(text).not.toContain('hol d');
    expect(chartChords(chart)).toEqual(['F#m', 'C#', 'A6sus', 'Cadd9']);
  });
});

describe('a single line of chords', () => {
  it('is enough to read the text as chords above the words', () => {
    const chart = parseChordPro('[Verse 1]\nF#m       C#\n   I am a patient one');
    expect(chartChords(chart)).toEqual(['F#m', 'C#']);
  });
});

describe('headings of a text with chords above the words', () => {
  it('open sections even without "Detect sections"', () => {
    const chart = parseChordPro('[Verse 1]\nAm   C\nla la\n\n[Chorus]\nF    G\nyeah');
    expect(chart.lines.filter((l) => l.kind === 'label').map((l) => (l.kind === 'label' ? [l.section, l.text] : null))).toEqual([['verse', 'Verse 1'], ['chorus', 'Chorus']]);
  });
});
