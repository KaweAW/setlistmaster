export interface ParsedDuration {
  valid: boolean;
  /** Undefined when the input is empty (no duration). */
  seconds?: number | undefined;
}

/** Parses "m:ss" (e.g. "3:45"). Empty is valid (no duration); "0:00" and anything else is not. */
export function parseDuration(input: string): ParsedDuration {
  const text = input.trim();
  if (!text) return { valid: true };
  const match = /^(\d{1,3}):([0-5]\d)$/.exec(text);
  if (!match) return { valid: false };
  const seconds = Number(match[1] ?? '0') * 60 + Number(match[2] ?? '0');
  return seconds > 0 ? { valid: true, seconds } : { valid: false };
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "2026-10-03" → "3 Oct 2026" in the given locale. Returns the input if it is not a valid date. */
export function formatDate(isoDate: string, locale: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Total length for setlists: "42:10", or "1:05:30" from one hour up. */
export function formatTotalDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${ss}` : `${minutes}:${ss}`;
}
