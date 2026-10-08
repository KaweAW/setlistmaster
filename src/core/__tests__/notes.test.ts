import { describe, expect, it } from 'vitest';
import { insertNote, noteDirective, parseChordPro } from '../chordpro';

describe('sticky notes in the text', () => {
  it('are read in every colour, and yellow is the default', () => {
    const { lines } = parseChordPro('{note: Slow intro}\n{note_pink: Wait for the drummer: 2x}\n[Am]hello\n{note_blue: Capo 2}');
    expect(lines.filter((l) => l.kind === 'note')).toEqual([
      { kind: 'note', color: 'yellow', text: 'Slow intro' },
      { kind: 'note', color: 'pink', text: 'Wait for the drummer: 2x' },
      { kind: 'note', color: 'blue', text: 'Capo 2' },
    ]);
    expect(lines.some((l) => l.kind === 'lyrics')).toBe(true);
  });

  it('ignore an empty note and a colour that does not exist', () => {
    const { lines } = parseChordPro('{note: }\n{note_purple: nope}\n[Am]x');
    expect(lines.filter((l) => l.kind === 'note')).toEqual([]);
  });

  it('are written on one line, without braces', () => {
    expect(noteDirective('yellow', 'Hi')).toBe('{note: Hi}');
    expect(noteDirective('green', '  a {b}\nc ')).toBe('{note_green: a b c}');
  });

  it('go on their own line above the line the cursor is on', () => {
    const text = '[Am]one\n[G]two\n[C]three';
    const at = text.indexOf('two') + 1; // inside the second line
    const result = insertNote(text, at, 'pink', 'Careful');
    expect(result.text).toBe('[Am]one\n{note_pink: Careful}\n[G]two\n[C]three');
    expect(result.text.slice(result.cursor)).toBe('[G]two\n[C]three');
    expect(insertNote('', 0, 'yellow', 'First').text).toBe('{note: First}');
    expect(insertNote('[Am]one', 0, 'blue', 'Top').text).toBe('{note_blue: Top}\n[Am]one');
  });

  it('survive a round trip through the parser', () => {
    const { text } = insertNote('[Am]one', 3, 'orange', 'Break: 4 bars');
    expect(parseChordPro(text).lines[0]).toEqual({ kind: 'note', color: 'orange', text: 'Break: 4 bars' });
  });
});
