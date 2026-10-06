// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from '../../state/uiStore';
import { MetronomePanel } from '../MetronomePanel';

let starts = 0;
let closed = 0;
class FakeAudio {
  currentTime = 0;
  destination = {};
  resume = () => Promise.resolve();
  close = () => { closed += 1; return Promise.resolve(); };
  createOscillator = () => ({ frequency: { value: 0 }, connect: (n: unknown) => n, start: () => { starts += 1; }, stop: () => {} });
  createGain = () => ({ gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: (n: unknown) => n });
}

beforeEach(() => {
  useUiStore.setState({ language: 'en' });
  vi.useFakeTimers();
  starts = 0; closed = 0;
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudio;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('MetronomePanel', () => {
  it('starts at the song tempo, adjusts, clicks while running and stops cleanly', () => {
    render(<MetronomePanel initialBpm={120} />);
    expect(screen.getByLabelText('Tempo: 120')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tempo +1' }));
    expect(screen.getByLabelText('Tempo: 121')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Metronome/ }));
    expect(starts).toBeGreaterThan(0);
    act(() => { vi.advanceTimersByTime(100); });

    fireEvent.click(screen.getByRole('button', { name: /Stop/ }));
    expect(closed).toBe(1);
  });
});
