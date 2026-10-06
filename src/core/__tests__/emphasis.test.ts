import { describe, expect, it } from 'vitest';
import { splitEmphasis } from '../emphasis';

describe('splitEmphasis', () => {
  it('splits bold runs', () => {
    expect(splitEmphasis('Fine → **Wish You Were Here**')).toEqual([
      { text: 'Fine → ', bold: false },
      { text: 'Wish You Were Here', bold: true },
    ]);
  });
  it('keeps plain text', () => {
    expect(splitEmphasis('Stop netto')).toEqual([{ text: 'Stop netto', bold: false }]);
  });
  it('treats an unmatched marker as plain text', () => {
    expect(splitEmphasis('a ** b')).toEqual([{ text: 'a ** b', bold: false }]);
  });
});
