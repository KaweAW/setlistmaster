import { describe, expect, it } from 'vitest';
import { splitMatches } from '../Highlight';

describe('splitMatches', () => {
  it('marks every term, ignoring case and accents', () => {
    expect(splitMatches('Café Tacvba', ['cafe', 'TAC'])).toEqual([
      { text: 'Café', hit: true },
      { text: ' ', hit: false },
      { text: 'Tac', hit: true },
      { text: 'vba', hit: false },
    ]);
  });
  it('returns the text whole without terms', () => {
    expect(splitMatches('Creep', [])).toEqual([{ text: 'Creep', hit: false }]);
  });
});
