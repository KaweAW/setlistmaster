// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CloudProvider } from '../../cloud/CloudProvider';
import { FakeCloudServer } from '../../cloud/__tests__/fakeCloud';
import { createDexieStore } from '../../data/dexie/dexieRepository';
import { DataProvider } from '../../data/DataProvider';
import { bootstrap } from '../../data/bootstrap';
import { usePwaStore } from '../../state/pwaStore';
import { useStorageStore } from '../../state/storageStore';
import { useUiStore } from '../../state/uiStore';
import { RemoteError } from '../../sync/engine';
import { NoticeBar } from '../NoticeBar';

let n = 0;
const DAY = 86_400_000;

function mount(store = createDexieStore({ dbName: `notice-${++n}` }), api: unknown = null) {
  render(
    <MemoryRouter>
      <DataProvider store={store}>
        <CloudProvider api={api as never}>
          <NoticeBar />
        </CloudProvider>
      </DataProvider>
    </MemoryRouter>,
  );
  return store;
}

beforeEach(() => {
  useUiStore.setState({ language: 'en', stageMode: false, activeBandId: null, lastBackupAt: Date.now(), firstSeenAt: Date.now(), backupSnoozedUntil: null });
  usePwaStore.setState({ needRefresh: false, offlineReady: false, applyUpdate: () => {} });
  useStorageStore.setState({ persistence: 'persisted', usage: null });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('notices, one at a time', () => {
  it('shows only the most important notice and says how many are waiting', async () => {
    usePwaStore.setState({ needRefresh: true, offlineReady: true });
    useStorageStore.setState({ persistence: 'denied' });
    useUiStore.setState({ firstSeenAt: Date.now() - 30 * DAY, lastBackupAt: null });
    mount();
    expect(await screen.findByText('A new version is ready.')).toBeTruthy();
    expect(screen.getByText('3 more')).toBeTruthy();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.queryByText(/may delete this app/)).toBeNull();
  });

  it('shows the next one when the first is dealt with', async () => {
    useStorageStore.setState({ persistence: 'denied' });
    usePwaStore.setState({ offlineReady: true });
    mount();
    expect(await screen.findByText(/may delete this app/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(await screen.findByText('Ready to work offline.')).toBeTruthy();
  });

  it('lets "ready to work offline" go away by itself', async () => {
    const timers = vi.spyOn(globalThis, 'setTimeout');
    usePwaStore.setState({ offlineReady: true });
    mount();
    expect(await screen.findByText('Ready to work offline.')).toBeTruthy();
    const call = timers.mock.calls.find(([, ms]) => ms === 6000);
    expect(call).toBeTruthy();
    act(() => (call![0] as () => void)());
    expect(screen.queryByText('Ready to work offline.')).toBeNull();
    timers.mockRestore();
  });

  it('tells the person when access to a shared band was removed', async () => {
    const server = new FakeCloudServer();
    const alex = server.as({ id: 'u-alex', email: 'alex@x.it' });
    const store = createDexieStore({ dbName: `notice-${++n}` });
    await bootstrap(store);
    await store.bands.create({ id: 'b1', name: 'The Band' });
    await store.sync.linkBand('b1');
    useUiStore.setState({ activeBandId: 'b1' });
    server.remote.failWith = new RemoteError('forbidden', 'not_a_member');
    mount(store, alex);
    expect(await screen.findByText(/no longer have access to “The Band”/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Details' }).getAttribute('href')).toBe('/settings');
  });

  it('shows nothing on stage', async () => {
    useUiStore.setState({ stageMode: true });
    usePwaStore.setState({ needRefresh: true });
    mount();
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });
});
