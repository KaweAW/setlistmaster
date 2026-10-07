import { describe, expect, it } from 'vitest';
import { formatTuningNotes, isStandardStrings, nameForStrings, parseTuningNotes, standardStrings, tuningStrings } from '../tuning';

describe('tuning notes', () => {
  it('normalizes separators', () => {
    expect(parseTuningNotes('D-G-C-F-A-D')).toEqual(['D', 'G', 'C', 'F', 'A', 'D']);
    expect(parseTuningNotes('D A D G B E')).toEqual(['D', 'A', 'D', 'G', 'B', 'E']);
    expect(parseTuningNotes('D, B, D, G, B, E')).toEqual(['D', 'B', 'D', 'G', 'B', 'E']);
  });
  it('uppercases and uses real sharp and flat signs', () => {
    expect(parseTuningNotes('eb ab db gb bb eb')).toEqual(['E♭', 'A♭', 'D♭', 'G♭', 'B♭', 'E♭']);
    expect(parseTuningNotes('F#-B-E')).toEqual(['F♯', 'B', 'E']);
    expect(parseTuningNotes('b')).toEqual(['B']);
  });
  it('leaves free text alone', () => {
    expect(parseTuningNotes('Open G slide')).toBeNull();
    expect(parseTuningNotes('')).toBeNull();
    expect(formatTuningNotes('Open G slide')).toBe('Open G slide');
  });
  it('formats as plain text', () => {
    expect(formatTuningNotes('D-G-C-F-A-D')).toBe('D G C F A D');
  });
});

describe('tuning strings', () => {
  it('starts from standard and adds low strings', () => {
    expect(standardStrings()).toEqual(['E', 'A', 'D', 'G', 'B', 'E']);
    expect(standardStrings(7)).toEqual(['B', 'E', 'A', 'D', 'G', 'B', 'E']);
    expect(standardStrings(8)).toEqual(['F♯', 'B', 'E', 'A', 'D', 'G', 'B', 'E']);
    expect(isStandardStrings(standardStrings())).toBe(true);
    expect(isStandardStrings(standardStrings(7))).toBe(false);
  });
  it('reads a tuning from its notes, with one spelling per note', () => {
    expect(tuningStrings('eb ab db gb bb eb')).toEqual(['E♭', 'A♭', 'C♯', 'F♯', 'B♭', 'E♭']);
    expect(tuningStrings('D-G-C-F-A-D')).toEqual(['D', 'G', 'C', 'F', 'A', 'D']);
    expect(tuningStrings('Open G slide')).toBeNull();
    expect(tuningStrings('E A D G')).toBeNull();
  });
  it('names known tunings and falls back to the notes', () => {
    expect(nameForStrings(standardStrings())).toBe('Standard');
    expect(nameForStrings(['D', 'A', 'D', 'G', 'B', 'E'])).toBe('Drop D');
    expect(nameForStrings(['D', 'B', 'D', 'G', 'B', 'E'])).toBe('D B D G B E');
  });
});

describe('tunings written without separators', () => {
  it.each([
    ['EADGBE', ['E', 'A', 'D', 'G', 'B', 'E']],
    ['DBDGBE', ['D', 'B', 'D', 'G', 'B', 'E']],
    ['DbAbDbGbBbEb', ['D♭', 'A♭', 'D♭', 'G♭', 'B♭', 'E♭']],
    ['D-G-C-F-A-D', ['D', 'G', 'C', 'F', 'A', 'D']],
  ])('%s', (text, notes) => {
    expect(parseTuningNotes(text)).toEqual(notes);
  });
  it('still rejects free text', () => {
    expect(parseTuningNotes('Open G slide')).toBeNull();
  });
});
