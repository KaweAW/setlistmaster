// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDataRevision } from '../../state/dataRevision';
import { RemoteFlash } from '../RemoteFlash';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useDataRevision.setState({ flashed: {} });
});

describe('RemoteFlash', () => {
  it('shows only for records a bandmate just changed, then forgets them', () => {
    vi.useFakeTimers();
    const { container } = render(<RemoteFlash id="song-1" />);
    expect(container.querySelector('.remote-flash')).toBeNull();

    act(() => useDataRevision.getState().flash(['song-1']));
    expect(container.querySelector('.remote-flash')).not.toBeNull();

    act(() => { vi.advanceTimersByTime(5000); });
    expect(container.querySelector('.remote-flash')).toBeNull();
  });

  it('ignores other records', () => {
    const { container } = render(<RemoteFlash id="song-1" />);
    act(() => useDataRevision.getState().flash(['song-2']));
    expect(container.querySelector('.remote-flash')).toBeNull();
  });
});
