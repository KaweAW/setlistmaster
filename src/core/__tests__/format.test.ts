import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, parseDuration } from '../format';

describe('duration', () => {
  it('parses m:ss', () => {
    expect(parseDuration('3:45')).toEqual({ valid: true, seconds: 225 });
    expect(parseDuration(' 12:05 ')).toEqual({ valid: true, seconds: 725 });
  });
  it('treats empty as valid and missing', () => {
    expect(parseDuration('')).toEqual({ valid: true });
  });
  it('rejects bad input', () => {
    for (const bad of ['3', '3:5', '3:60', 'abc', '0:00', '3:45:10', '-1:20']) {
      expect(parseDuration(bad).valid).toBe(false);
    }
  });
  it('formats seconds', () => {
    expect(formatDuration(225)).toBe('3:45');
    expect(formatDuration(65)).toBe('1:05');
  });
});

describe('formatBytes', () => {
  it('uses B, KB and MB', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
