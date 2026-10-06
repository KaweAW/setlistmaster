import { describe, expect, it } from 'vitest';
import { chartChords, parseChordPro } from '../chordpro';
import { chordsOverWordsToChordPro } from '../chordsOverWords';
import { MAX_SCROLL_LEVEL, MIN_SCROLL_LEVEL, scrollSpeed, swipeDirection } from '../autoscroll';

const lyricsOf = (text: string) =>
  parseChordPro(text).lines.flatMap((l) => (l.kind === 'lyrics' ? [l.segments.map((s) => `${s.chord ? `[${s.chord}]` : ''}${s.lyrics}`).join('')] : []));

describe('parseChordPro', () => {
  it('reads chords above lyrics, with meta, sections and comments', () => {
    const chart = parseChordPro(
      '{title: Black Hole Sun}\n{artist: Soundgarden}\n{key: Em}\n{start_of_verse: Verse 1}\n[Em]Black hole [G]sun\nWon\'t you come\n{end_of_verse}\n\n{soc}\n[C]Chorus [D/F#]line\n{eoc}\n{c: play twice}',
    );
    expect(chart).toMatchObject({ title: 'Black Hole Sun', artist: 'Soundgarden', key: 'Em' });
    expect(chart.lines.map((l) => l.kind)).toEqual(['label', 'lyrics', 'lyrics', 'blank', 'label', 'lyrics', 'comment']);
    expect(chart.lines[0]).toEqual({ kind: 'label', section: 'verse', text: 'Verse 1' });
    expect(chart.lines[4]).toMatchObject({ kind: 'label', section: 'chorus', text: '' });
    const first = chart.lines[1]!;
    expect(first.kind === 'lyrics' && first.segments).toEqual([
      { chord: 'Em', lyrics: 'Black ' },
      { chord: null, lyrics: 'hole ' },
      { chord: 'G', lyrics: 'sun' },
    ]);
    expect(chart.lines[5]).toMatchObject({ kind: 'lyrics', section: 'chorus' });
    expect(chartChords(chart)).toEqual(['Em', 'G', 'C', 'D/F#']);
  });

  it('keeps Cyrillic and unusual chords', () => {
    expect(lyricsOf('[N.C.]Hello [Bb7sus4]you\n[Am]Спокойная [G]ночь')).toEqual(['[N.C.]Hello [Bb7sus4]you', '[Am]Спокойная [G]ночь']);
  });

  it('shows tab sections as monospace lines', () => {
    const tab = parseChordPro('{sot}\ne|--0--|\n{eot}');
    expect(tab.lines.some((l) => l.kind === 'tab')).toBe(true);
  });

  it('never throws on half-written text and keeps the readable lines', () => {
    const chart = parseChordPro('[Am]fine line\n[Am unclosed\n{title: oops\nplain text');
    const texts = chart.lines.flatMap((l) => (l.kind === 'lyrics' ? [l.segments.map((s) => s.lyrics).join('')] : []));
    expect(texts[0]).toBe('fine line');
    expect(texts).toContain('[Am unclosed');
    expect(texts).toContain('plain text');
  });

  it('handles empty text and collapses blank lines', () => {
    expect(parseChordPro('').lines).toEqual([]);
    expect(parseChordPro('\n\n[C]a\n\n\n\n[G]b\n\n').lines.map((l) => l.kind)).toEqual(['lyrics', 'blank', 'lyrics']);
  });
});

describe('chordsOverWordsToChordPro', () => {
  it('places each chord at its column over the lyrics', () => {
    const out = chordsOverWordsToChordPro('Em            G\nBlack hole sun, won\'t you come\nC        D/F#\nand wash away the rain');
    expect(out).toBe("[Em]Black hole sun[G], won't you come\n[C]and wash [D/F#]away the rain");
  });

  it('turns section labels into comments', () => {
    const out = chordsOverWordsToChordPro('[Verse 1]\nAm\nHello\n\nChorus:\nG\nWorld\n\n(Solo)');
    expect(out).toBe('{comment: Verse 1}\n[Am]Hello\n\n{comment: Chorus}\n[G]World\n\n{comment: Solo}');
  });

  it('keeps chords after the end of the lyrics', () => {
    expect(chordsOverWordsToChordPro('C        G   D\nshort')).toBe('[C]short[G][D]');
  });

  it('converts chord-only lines (intro, solo) to chords with spaces', () => {
    expect(chordsOverWordsToChordPro('Intro\nAm  F  C  G\n\nAm\nlyric')).toBe('{comment: Intro}\n[Am] [F] [C] [G]\n\n[Am]lyric');
    expect(chordsOverWordsToChordPro('Intro: Am F C | G x2')).toBe('{comment: Intro}\n[Am] [F] [C] [G]');
  });

  it('never mistakes lyrics for chords (La la la, Bad, solfège, a lone "A")', () => {
    expect(chordsOverWordsToChordPro('Am   F\nLa la la')).toBe('[Am]La la[F] la');
    expect(chordsOverWordsToChordPro('Bad Dad Face')).toBe('Bad Dad Face');
    expect(chordsOverWordsToChordPro('Do Re Mi\nFa Sol La')).toBe('Do Re Mi\nFa Sol La');
    expect(chordsOverWordsToChordPro('A man walks in')).toBe('A man walks in');
  });

  it('handles Windows line breaks and trailing spaces', () => {
    expect(chordsOverWordsToChordPro('Am   \r\nHello world  \r\n')).toBe('[Am]Hello world');
  });

  it('turns tabs into spaces (4 columns) before aligning', () => {
    const out = chordsOverWordsToChordPro('Am\tF\nHello there you');
    expect(out).not.toContain('\t');
    expect(out).toBe('[Am]Hello [F]there you');
  });

  it('works with Cyrillic lyrics', () => {
    expect(chordsOverWordsToChordPro('Am        G\nСпокойная ночь')).toBe('[Am]Спокойная [G]ночь');
  });

  it('escapes brackets in lyrics so they are not read as chords, and round-trips through the parser', () => {
    const out = chordsOverWordsToChordPro('Am\nhe said [spoken] to me');
    expect(out).toBe('[Am]he said \\[spoken\\] to me');
    expect(lyricsOf(out)).toEqual(['[Am]he said [spoken] to me']);
  });

  it('produces text the chart parser reads back with the same chords and lyrics', () => {
    const out = chordsOverWordsToChordPro('Intro\nAm  F\n\nVerse 1\nAm             F\nSome lyrics go right here\nC            G\nand continue down here');
    expect(lyricsOf(out)).toEqual(['[Am] [F]', '[Am]Some lyrics go [F]right here', '[C]and continue [G]down here']);
  });
});

describe('auto-scroll and swipe', () => {
  it('speeds up with the level and stays in range', () => {
    const speeds = Array.from({ length: MAX_SCROLL_LEVEL }, (_, i) => scrollSpeed(i + 1));
    expect(speeds.every((s, i) => i === 0 || s > speeds[i - 1]!)).toBe(true);
    expect(scrollSpeed(0)).toBe(scrollSpeed(MIN_SCROLL_LEVEL));
    expect(scrollSpeed(99)).toBe(scrollSpeed(MAX_SCROLL_LEVEL));
  });

  it('recognises only deliberate horizontal swipes', () => {
    expect(swipeDirection(-120, 10)).toBe('next');
    expect(swipeDirection(120, -20)).toBe('previous');
    expect(swipeDirection(-40, 0)).toBeNull(); // too short
    expect(swipeDirection(-120, 100)).toBeNull(); // mostly vertical: a scroll
  });
});
