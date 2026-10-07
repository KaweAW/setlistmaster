import { describe, expect, it } from 'vitest';
import { diatonicChords, splitKey } from '../chords';
import { chartSections, chartStats, insertChord, insertSection, parseChordPro } from '../chordpro';

describe('diatonicChords', () => {
  it('gives the usual chords of a major key', () => {
    expect(diatonicChords('G')).toEqual(['G', 'Am', 'Bm', 'C', 'D', 'Em', 'D7']);
    expect(diatonicChords('C')).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'G7']);
  });
  it('gives the chords of a minor key', () => {
    expect(diatonicChords('Am')).toEqual(['Am', 'C', 'Dm', 'Em', 'F', 'G', 'E7']);
    expect(diatonicChords('Em')).toEqual(['Em', 'G', 'Am', 'Bm', 'C', 'D', 'B7']);
  });
  it('spells flat keys with flats', () => {
    expect(diatonicChords('Bb')).toEqual(['Bb', 'Cm', 'Dm', 'Eb', 'F', 'Gm', 'F7']);
  });
  it('is empty for something that is not a key', () => {
    expect(diatonicChords('')).toEqual([]);
    expect(diatonicChords(undefined)).toEqual([]);
    expect(diatonicChords('banana')).toEqual([]);
  });
});

describe('splitKey', () => {
  it('reads tonic and mode, normalising the spelling', () => {
    expect(splitKey('Em')).toEqual({ tonic: 'E', minor: true });
    expect(splitKey('F#')).toEqual({ tonic: 'F#', minor: false });
    expect(splitKey('Db')).toEqual({ tonic: 'C#', minor: false });
    expect(splitKey('D#m')).toEqual({ tonic: 'Eb', minor: true });
    expect(splitKey('nope')).toBeNull();
  });
});

describe('chartSections', () => {
  it('splits at each label and keeps what comes before the first one', () => {
    const chart = parseChordPro('[C]intro line\n\n{start_of_verse: Verse 1}\n[G]one\n{end_of_verse}\n\n{start_of_chorus}\n[C]two\n{end_of_chorus}');
    const parts = chartSections(chart);
    expect(parts.map((p) => [p.section.kind, p.section.text])).toEqual([['none', ''], ['verse', 'Verse 1'], ['chorus', '']]);
    expect(parts.map((p) => p.section.index)).toEqual([0, 1, 2]);
  });
  it('is empty for an empty chart', () => {
    expect(chartSections(parseChordPro(''))).toEqual([]);
  });
});

describe('editor insertions', () => {
  it('inserts a section on its own lines and puts the cursor inside', () => {
    const r = insertSection('', 0, 'verse', 'Verse');
    expect(r.text).toBe('{start_of_verse: Verse}\n\n{end_of_verse}\n');
    expect(r.cursor).toBe('{start_of_verse: Verse}\n'.length);
  });
  it('goes before the line the cursor is on, with a blank line between', () => {
    const src = 'first line\nsecond line';
    const r = insertSection(src, 14, 'chorus', 'Chorus');
    expect(r.text).toBe('first line\n{start_of_chorus: Chorus}\n\n{end_of_chorus}\n\nsecond line');
    expect(r.text.slice(r.cursor - 24, r.cursor)).toBe('{start_of_chorus: Chorus}\n'.slice(-24));
  });
  it('inserts a chord, replacing a selection', () => {
    expect(insertChord('hello world', 6, 6, 'Am')).toEqual({ text: 'hello [Am]world', cursor: 10 });
    expect(insertChord('hello world', 0, 5, 'G')).toEqual({ text: '[G] world', cursor: 3 });
  });
  it('counts written lines and chords, ignoring directives', () => {
    expect(chartStats('{start_of_verse}\n[Am]one [G]two\n\nthree\n{end_of_verse}')).toEqual({ lines: 2, chords: 2 });
    expect(chartStats('')).toEqual({ lines: 0, chords: 0 });
  });
});

describe('structureSections', () => {
  it('turns headings into blocks', async () => {
    const { structureSections, parseChordPro } = await import('../chordpro');
    const r = structureSections('[Intro]\n[Em]a\n\n[Verse 1: David]\n[G]b\n\nChorus:\nc\n\n**Pre-Chorus**\nd\n\n[Instrumental Break]\n[Am]e');
    expect(r.count).toBe(5);
    expect(r.text).toContain('{start_of_intro: Intro}\n[Em]a\n{end_of_intro}\n');
    expect(r.text).toContain('{start_of_verse: Verse 1: David}');
    expect(r.text).toContain('{start_of_prechorus: Pre-Chorus}');
    expect(r.text).toContain('{start_of_instrumental: Instrumental Break}');
    const kinds = parseChordPro(r.text).lines.filter((l) => l.kind === 'label').map((l) => (l as { section: string }).section);
    expect(kinds).toEqual(['intro', 'verse', 'chorus', 'prechorus', 'instrumental']);
  });
  it('leaves other text alone', async () => {
    const { structureSections } = await import('../chordpro');
    expect(structureSections('[Am]hello world\nI sing the chorus of a long song today').count).toBe(0);
  });
});

describe('guessSections', () => {
  it('labels repeated stanzas as chorus and the others as verses', async () => {
    const { guessSections, parseChordPro } = await import('../chordpro');
    const text = 'Karma police\nArrest this man\nHe talks in maths\n\nKarma police\nArrest this girl\nHer Hitler hairdo\n\nThis is what you get\nWhen you mess with us\n\nKarma police\nI have given all I can\nIt is not enough\n\nThis is what you get\nWhen you mess with us';
    const r = guessSections(text);
    expect(r.count).toBe(5);
    const labels = parseChordPro(r.text).lines.filter((l) => l.kind === 'label').map((l) => (l as { text: string }).text);
    expect(labels).toEqual(['Verse 1', 'Verse 2', 'Chorus', 'Verse 3', 'Chorus']);
  });
  it('does nothing on a single stanza or text that already has blocks', async () => {
    const { guessSections } = await import('../chordpro');
    expect(guessSections('one\ntwo').count).toBe(0);
    expect(guessSections('{start_of_verse: V}\na\n{end_of_verse}\n\nb').count).toBe(0);
  });
});

describe('chords over words with sections', () => {
  it('places chords, understands Italian headings and leaves existing blocks alone', async () => {
    const { chordsOverWordsToChordPro, looksLikeChordsOverWords } = await import('../chordsOverWords');
    const { structureSections } = await import('../chordpro');
    const text = 'Verso 1\nAm      F\nKarma police\nEm\nArrest this man\n\nChorus\nAm\nla la';
    expect(looksLikeChordsOverWords(text)).toBe(true);
    expect(looksLikeChordsOverWords('[Am]already chordpro\n[G]x')).toBe(false);
    const r = structureSections(chordsOverWordsToChordPro(text));
    expect(r.count).toBe(2);
    expect(r.text).toContain('{start_of_verse: Verso 1}');
    expect(r.text).toContain('[Am]Karma ');
    const kept = chordsOverWordsToChordPro('{start_of_verse: Verse 1}\nEm   G\nhello there\n{end_of_verse}');
    expect(kept).toBe('{start_of_verse: Verse 1}\n[Em]hello[G] there\n{end_of_verse}');
  });
});
