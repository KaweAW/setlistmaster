import { describe, expect, it } from 'vitest';
import { accidentalsForKey, inferKey, isChord, parseChord, transposeChord, transposeKey } from '../chords';

describe('chord detection', () => {
  it('accepts real chords', () => {
    for (const c of ['A', 'Am', 'F#m7', 'Bb', 'Cmaj7', 'Dsus4', 'Gadd9', 'Bdim', 'E7#9', 'F#m7b5', 'C6/9', 'D/F#', 'Am7/G', 'C+', 'Ebmaj7', 'G(add9)', 'A♭m']) {
      expect(isChord(c), c).toBe(true);
    }
  });
  it('rejects ordinary words, solfège and noise', () => {
    for (const c of ['Bad', 'Face', 'Dim', 'La', 'Do', 'Re', 'Mi', 'Sol', 'Fa', 'Be', 'Add', 'Egg', 'Dead', 'the', 'x2', '|', 'N.C.', 'H', 'Cat']) {
      expect(isChord(c), c).toBe(false);
    }
  });
  it('splits root, suffix and bass', () => {
    expect(parseChord('F#m7/C#')).toEqual({ root: 'F#', suffix: 'm7', bass: 'C#' });
    expect(parseChord('Am')).toEqual({ root: 'A', suffix: 'm' });
  });
});

describe('transposeChord', () => {
  it('moves root and bass, keeping the quality', () => {
    expect(transposeChord('F#m7/C#', 3)).toBe('Am7/E');
    expect(transposeChord('Am', 2)).toBe('Bm');
    expect(transposeChord('C', -1, 'sharp')).toBe('B');
    expect(transposeChord('E7#9', 5)).toBe('A7#9');
  });
  it('wraps around the octave', () => {
    expect(transposeChord('G', 12)).toBe('G');
    expect(transposeChord('G', 14)).toBe('A');
    expect(transposeChord('A', -3)).toBe('F#');
  });
  it('leaves zero steps and non-chords untouched, even unusual spellings', () => {
    expect(transposeChord('A♭m', 0)).toBe('A♭m');
    expect(transposeChord('N.C.', 5)).toBe('N.C.');
    expect(transposeChord('x2', 5)).toBe('x2');
  });
  it('uses the requested spelling for black keys', () => {
    expect(transposeChord('G', 1, 'sharp')).toBe('G#');
    expect(transposeChord('G', 1, 'flat')).toBe('Ab');
    expect(transposeChord('D/F#', 2, 'flat')).toBe('E/Ab');
  });
});

describe('keys', () => {
  it('chooses flats or sharps from the key', () => {
    expect(accidentalsForKey('F')).toBe('sharp'.length ? 'flat' : 'flat'); // unspelled F major: flats
    expect(accidentalsForKey('G')).toBe('sharp');
    expect(accidentalsForKey('Em')).toBe('sharp');
    expect(accidentalsForKey('Dm')).toBe('flat');
    expect(accidentalsForKey('C')).toBe('neutral');
    expect(accidentalsForKey('Am')).toBe('neutral');
    expect(accidentalsForKey(undefined)).toBe('neutral');
    expect(accidentalsForKey('???')).toBe('neutral');
  });
  it('follows the key after the move', () => {
    expect(accidentalsForKey('G', 3)).toBe('flat'); // G → Bb
    expect(accidentalsForKey('C', 2)).toBe('sharp'); // C → D
    expect(accidentalsForKey('Em', 1)).toBe('flat'); // Em → Fm
  });
  it('respects an explicit spelling when not moving', () => {
    expect(accidentalsForKey('Bb', 0)).toBe('flat');
    expect(accidentalsForKey('F#m', 0)).toBe('sharp');
  });
  it('transposes keys with a sensible name', () => {
    expect(transposeKey('Em', 3)).toBe('Gm');
    expect(transposeKey('G', 3)).toBe('Bb');
    expect(transposeKey('G', 1)).toBe('Ab');
    expect(transposeKey('E', 1)).toBe('F');
    expect(transposeKey('D', 6)).toBe('Ab');
    expect(transposeKey('not a key', 4)).toBe('not a key');
  });
  it('guesses the key from the first chord', () => {
    expect(inferKey(['N.C.', 'Em', 'G'])).toBe('Em');
    expect(inferKey(['Cmaj7', 'F'])).toBe('C');
    expect(inferKey(['x'])).toBeUndefined();
  });
});
