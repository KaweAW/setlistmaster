import { describe, expect, it } from 'vitest';
import { formatTuningNotes, parseTuningNotes } from '../tuning';

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
