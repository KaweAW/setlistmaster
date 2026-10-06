export const MIN_BPM = 30;
export const MAX_BPM = 300;

export const clampBpm = (bpm: number): number => Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));

/** Tap tempo: BPM from the last few taps (ms timestamps). A pause longer than 2 s starts a new count. */
export function tapTempo(taps: readonly number[]): number | undefined {
  let run: number[] = [];
  for (const tap of taps) {
    const last = run.at(-1);
    run = last !== undefined && tap - last > 2000 ? [tap] : [...run, tap];
  }
  const recent = run.slice(-6);
  if (recent.length < 2) return undefined;
  const average = (recent.at(-1)! - recent[0]!) / (recent.length - 1);
  return average > 0 ? clampBpm(60000 / average) : undefined;
}
