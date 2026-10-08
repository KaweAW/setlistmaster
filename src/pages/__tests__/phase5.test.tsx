// @vitest-environment jsdom
import { choose } from '../../components/__tests__/choose';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from '../../routes';
import { ThemeSync } from '../../components/ThemeSync';
import { createBackup, parseBackup } from '../../core/backup';
import { createDexieStore } from '../../data/dexie/dexieRepository';
import { bootstrap } from '../../data/bootstrap';
import { DataProvider } from '../../data/DataProvider';
import { reloadApp } from '../../lib/reload';
import { saveFile } from '../../lib/saveFile';
import { usePwaStore } from '../../state/pwaStore';
import { useStorageStore } from '../../state/storageStore';
import { useUiStore } from '../../state/uiStore';

vi.mock('../../lib/saveFile', () => ({ saveFile: vi.fn(async () => 'downloaded') }));
vi.mock('../../lib/reload', () => ({ reloadApp: vi.fn() }));
vi.mock('../../components/PdfViewer', () => ({ default: () => null }));

// The song page loads the chord parser on demand: pay that cost once, before the tests.
beforeAll(async () => {
  await import('../SongPage');
}, 60_000);

const DAY = 86_400_000;
const UI_DEFAULTS = {
  theme: 'light' as const, stageMode: false, songFontSize: 20, stageFontSize: 28, scrollLevel: 3,
  lastBackupAt: null, firstSeenAt: Date.now(), backupSnoozedUntil: null,
};

function mockStorage(persisted: boolean) {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: {
      persisted: async () => false,
      persist: async () => persisted,
      estimate: async () => ({ usage: 2 * 1024 * 1024, quota: 1e9 }),
    },
  });
}

beforeEach(() => {
  useUiStore.setState(UI_DEFAULTS);
  usePwaStore.setState({ needRefresh: false, offlineReady: false, applyUpdate: () => {} });
  useStorageStore.setState({ persistence: 'unknown', usage: null });
  mockStorage(true);
  vi.mocked(saveFile).mockClear();
  vi.mocked(reloadApp).mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (navigator as { wakeLock?: unknown }).wakeLock;
  document.documentElement.classList.remove('dark');
});

let n = 0;
async function setup(path: string | ((ctx: { songId: string; setlistId: string }) => string)) {
  const store = createDexieStore({ dbName: `ui5-${++n}` });
  const band = await bootstrap(store);
  const setlist = (await store.setlists.listBy('bandId', band.id))[0]!;
  const song = (await store.songs.listBy('bandId', band.id))[0]!;
  await store.songs.update(song.id, { chordpro: '[Em]Black hole [G]sun', key: 'Em' });
  const target = typeof path === 'string' ? path : path({ songId: song.id, setlistId: setlist.id });
  render(
    <MemoryRouter initialEntries={[target]}>
      <DataProvider store={store}>
        <ThemeSync />
        <AppRoutes />
      </DataProvider>
    </MemoryRouter>,
  );
  return { store, band, setlist, song };
}

const readBlob = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

const fileWithText = (text: string, name = 'backup.json') => {
  const file = new File([text], name, { type: 'application/json' });
  if (!file.text) Object.defineProperty(file, 'text', { value: async () => text });
  return file;
};
const chooseFile = (file: File) =>
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });

describe('theme and stage mode', () => {
  it('applies the dark colours for the dark theme and always in stage mode', async () => {
    render(<ThemeSync />);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    act(() => useUiStore.setState({ theme: 'dark' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    act(() => useUiStore.setState({ theme: 'light', stageMode: true }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    act(() => useUiStore.setState({ stageMode: false }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('is switched from the settings, and the theme can be chosen', async () => {
    await setup('/settings');
    await screen.findByRole('heading', { name: 'Appearance' });
    await choose('Theme', 'dark');
    expect(useUiStore.getState().theme).toBe('dark');
    await choose('Theme', 'light');
    fireEvent.click(screen.getByRole('button', { name: 'Stage mode' }));
    expect(useUiStore.getState().stageMode).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByRole('button', { name: 'Exit stage mode' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('hides editing on the setlist and keeps a way out', async () => {
    await setup(({ setlistId }) => `/setlist/${setlistId}`);
    await screen.findByRole('heading', { name: 'Example setlist' });
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stage mode' }));
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Export PDF' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Exit stage mode' }));
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
  });

  it('removes the navigation bar from the setlist on stage, but not from the other screens', async () => {
    useUiStore.setState({ stageMode: true });
    const { setlist } = await setup(({ setlistId }) => `/setlist/${setlistId}`);
    await screen.findByRole('heading', { name: 'Example setlist' });
    const bottomNav = () => document.querySelector('nav[class*="bottom-0"]') as HTMLElement;
    expect(bottomNav().classList.contains('hidden')).toBe(true);
    expect(bottomNav().classList.contains('flex')).toBe(false);
    expect(document.querySelector('aside')!.className).not.toContain('md:flex'); // the desktop side bar too
    cleanup();
    await act(async () => {});
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <DataProvider store={createDexieStore({ dbName: `ui5-nav-${setlist.id}` })}>
          <AppRoutes />
        </DataProvider>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Appearance' });
    expect(bottomNav().classList.contains('flex')).toBe(true);
    expect(document.querySelector('aside')!.className).toContain('md:flex');
  });

  it('on the song page uses the stage text size, hides Edit and shows the wake-lock state', async () => {
    useUiStore.setState({ stageMode: true });
    const { song } = await setup(({ songId }) => `/song/${songId}`);
    await screen.findByRole('heading', { name: song.title });
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull();
    expect((document.querySelector('main .leading-normal') as HTMLElement).style.fontSize).toBe('28px');
    expect(await screen.findByText(/The screen may turn off/)).toBeTruthy(); // jsdom has no Wake Lock API

    // changing the size on stage leaves the everyday size alone
    fireEvent.click(screen.getByRole('button', { name: 'Display controls' }));
    fireEvent.click(screen.getByRole('button', { name: 'Text size +' }));
    expect(useUiStore.getState().stageFontSize).toBe(30);
    expect(useUiStore.getState().songFontSize).toBe(20);
  });
});

describe('screen wake lock', () => {
  function mockWakeLock() {
    const sentinel = { release: vi.fn(async () => {}), addEventListener: vi.fn() };
    const request = vi.fn(async () => sentinel);
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
    return { request, sentinel };
  }

  it('is taken in stage mode, shown as active, and released when leaving it', async () => {
    const { request, sentinel } = mockWakeLock();
    useUiStore.setState({ stageMode: true });
    const { song } = await setup(({ songId }) => `/song/${songId}`);
    await screen.findByRole('heading', { name: song.title });
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    expect(await screen.findByText(/Screen stays on/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Exit stage mode' }));
    await waitFor(() => expect(sentinel.release).toHaveBeenCalled());
    expect(screen.queryByText(/Screen stays on/)).toBeNull();
  });

  it('is also taken while the page scrolls by itself', async () => {
    const { request } = mockWakeLock();
    const { song } = await setup(({ songId }) => `/song/${songId}`);
    await screen.findByRole('heading', { name: song.title });
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Auto-scroll/ }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
  });

  it('is taken again when the app comes back to the foreground', async () => {
    const { request } = mockWakeLock();
    useUiStore.setState({ stageMode: true });
    await setup(({ songId }) => `/song/${songId}`);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    // the browser released the lock while the app was in the background: the sentinel reports it
    const release = (await request.mock.results[0]!.value).addEventListener.mock.calls[0]![1] as () => void;
    act(() => release());
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });

  it('warns when the browser refuses it', async () => {
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: vi.fn(async () => { throw new Error('denied'); }) } });
    useUiStore.setState({ stageMode: true });
    await setup(({ songId }) => `/song/${songId}`);
    expect(await screen.findByText(/The screen may turn off/)).toBeTruthy();
  });
});

describe('backup and restore', () => {
  it('saves one file with everything and remembers when', async () => {
    const { store } = await setup('/settings');
    fireEvent.click(await screen.findByRole('button', { name: 'Download backup' }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    const [blob, filename] = vi.mocked(saveFile).mock.calls[0]!;
    expect(filename).toMatch(/^scaletta-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const parsed = parseBackup(await readBlob(blob));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.summary.songs).toBe(25);
      expect(parsed.snapshot.songs.find((s) => s.chordpro.includes('Black hole'))).toBeTruthy();
    }
    expect(await screen.findByText('Backup ready.')).toBeTruthy();
    expect(useUiStore.getState().lastBackupAt).not.toBeNull();
    expect(await store.songs.listAll()).toHaveLength(25);
  });

  it('does not count a cancelled share as a backup', async () => {
    vi.mocked(saveFile).mockResolvedValueOnce('cancelled');
    await setup('/settings');
    fireEvent.click(await screen.findByRole('button', { name: 'Download backup' }));
    await waitFor(() => expect(saveFile).toHaveBeenCalled());
    expect(useUiStore.getState().lastBackupAt).toBeNull();
  });

  it('shows what a backup contains and replaces everything only after confirmation', async () => {
    const { store } = await setup('/settings');
    await screen.findByRole('button', { name: 'Download backup' });
    const snapshot = await store.bulk.readAll();
    snapshot.songs = snapshot.songs.slice(0, 3);
    snapshot.items = [];
    chooseFile(fileWithText(JSON.stringify(createBackup(snapshot, Date.UTC(2026, 9, 3)))));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/Songs: 3 · Setlists: 1 · PDFs: 0/)).toBeTruthy();
    expect(within(dialog).getByText(/replaces ALL the data/)).toBeTruthy();
    expect(await store.songs.listAll()).toHaveLength(25); // nothing changed yet
    expect(reloadApp).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Replace everything' }));
    await waitFor(() => expect(reloadApp).toHaveBeenCalledOnce());
    expect(await store.songs.listAll()).toHaveLength(3);
  });

  it('lets the user cancel, or save the current data first', async () => {
    const { store } = await setup('/settings');
    await screen.findByRole('button', { name: 'Download backup' });
    chooseFile(fileWithText(JSON.stringify(createBackup(await store.bulk.readAll(), 1))));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save current data first' }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(reloadApp).not.toHaveBeenCalled();
  });

  it.each([
    ['this is not json', /not valid JSON/],
    ['{"hello": "world"}', /not a Scaletta backup/],
    [JSON.stringify({ format: 'scaletta-backup', version: 99, exportedAt: 1, data: {} }), /newer version/],
    [JSON.stringify({ format: 'scaletta-backup', version: 1, exportedAt: 1, data: { bands: [] } }), /damaged or incomplete/],
  ])('refuses a bad file and changes nothing: %s', async (text, message) => {
    const { store } = await setup('/settings');
    await screen.findByRole('button', { name: 'Download backup' });
    chooseFile(fileWithText(text));
    expect((await screen.findByRole('alert')).textContent).toMatch(message);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await store.songs.listAll()).toHaveLength(25);
    expect(reloadApp).not.toHaveBeenCalled();
  });

  it('wipes everything only after two confirmations', async () => {
    const { store } = await setup('/settings');
    const wipe = await screen.findByRole('button', { name: 'Delete all data' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    fireEvent.click(wipe);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(await store.songs.listAll()).toHaveLength(25);

    confirm.mockReturnValue(true);
    fireEvent.click(wipe);
    await waitFor(() => expect(reloadApp).toHaveBeenCalledOnce());
    expect(await store.bands.listAll()).toHaveLength(0);
  });
});

describe('data and offline status', () => {
  it('shows protected storage, space used and the last backup', async () => {
    useUiStore.setState({ lastBackupAt: Date.UTC(2026, 9, 1) });
    await setup('/settings');
    expect(await screen.findByText('Protected from automatic cleanup')).toBeTruthy();
    expect(screen.getByText(/2\.0 MB used/)).toBeTruthy();
    expect(screen.getByText(/2026/)).toBeTruthy();
  });

  it('warns when the browser may delete the data, and can ask again', async () => {
    mockStorage(false);
    await setup('/settings');
    expect(await screen.findByText('Not protected: the browser may clear the data')).toBeTruthy();
    mockStorage(true);
    fireEvent.click(screen.getByRole('button', { name: 'Ask again' }));
    expect(await screen.findByText('Protected from automatic cleanup')).toBeTruthy();
  });
});

describe('notices', () => {
  it('reminds about the backup after two weeks, and can be snoozed', async () => {
    useUiStore.setState({ firstSeenAt: Date.now() - 20 * DAY });
    await setup('/');
    expect(await screen.findByText('You have not made a backup yet.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back up' }).getAttribute('href')).toBe('/settings');
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    await waitFor(() => expect(screen.queryByText('You have not made a backup yet.')).toBeNull());
    expect(useUiStore.getState().backupSnoozedUntil! - Date.now()).toBeGreaterThan(2 * DAY);
  });

  it('says how long ago the last backup was', async () => {
    useUiStore.setState({ lastBackupAt: Date.now() - 30 * DAY });
    await setup('/');
    expect(await screen.findByText('Your last backup was 30 days ago.')).toBeTruthy();
  });

  it('stays quiet after a recent backup and on a fresh install', async () => {
    useUiStore.setState({ lastBackupAt: Date.now() - DAY });
    await setup('/');
    await screen.findByText('Example setlist');
    expect(screen.queryByText(/backup/i)).toBeNull();
  });

  it('offers a new version only when one is waiting, and applies it on request', async () => {
    const applyUpdate = vi.fn();
    usePwaStore.setState({ needRefresh: true, applyUpdate });
    await setup('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Reload' }));
    expect(applyUpdate).toHaveBeenCalledOnce();
  });

  it('confirms the app is ready for offline use, once', async () => {
    usePwaStore.setState({ offlineReady: true });
    await setup('/');
    expect(await screen.findByText('Ready to work offline.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByText('Ready to work offline.')).toBeNull();
  });

  it('warns about unprotected storage', async () => {
    mockStorage(false);
    await setup('/');
    expect(await screen.findByText(/may delete this app’s data/)).toBeTruthy();
  });

  it('shows nothing on stage', async () => {
    useUiStore.setState({ stageMode: true, firstSeenAt: Date.now() - 40 * DAY });
    usePwaStore.setState({ needRefresh: true });
    await setup('/');
    await screen.findByText('Example setlist');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
