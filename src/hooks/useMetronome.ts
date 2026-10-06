import { useCallback, useEffect, useRef, useState } from 'react';

const LOOKAHEAD_S = 0.12;
const TICK_MS = 25;

/**
 * A click on the Web Audio clock: notes are scheduled slightly ahead, so the beat stays steady even when the page is busy
 * scrolling. Beat 0 of each bar is higher and louder. `beat` is the index (0-based) of the beat just played, for the light.
 */
export function useMetronome(bpm: number, beatsPerBar = 4) {
  const [running, setRunning] = useState(false);
  const [beat, setBeat] = useState<number | undefined>();
  const bpmRef = useRef(bpm);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  useEffect(() => {
    if (!running) return;
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    void ctx.resume?.();
    let next = ctx.currentTime + 0.05;
    let count = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const click = (at: number, accent: boolean) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = accent ? 1500 : 1000;
      gain.gain.setValueAtTime(accent ? 0.9 : 0.5, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.06);
    };

    const tick = () => {
      while (next < ctx.currentTime + LOOKAHEAD_S) {
        const index = count % beatsPerBar;
        click(next, index === 0);
        const wait = Math.max(0, (next - ctx.currentTime) * 1000);
        const timer = setTimeout(() => { timers.delete(timer); setBeat(index); }, wait);
        timers.add(timer);
        next += 60 / bpmRef.current;
        count += 1;
      }
    };
    tick();
    const interval = setInterval(tick, TICK_MS);
    return () => {
      clearInterval(interval);
      timers.forEach(clearTimeout);
      setBeat(undefined);
      void ctx.close?.();
    };
  }, [running, beatsPerBar]);

  const toggle = useCallback(() => setRunning((r) => !r), []);
  return { running, beat, toggle, stop: () => setRunning(false) };
}
