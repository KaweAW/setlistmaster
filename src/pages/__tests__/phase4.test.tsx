// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from '../../routes';
import { createDexieStore } from '../../data/dexie/dexieRepository';
import { bootstrap } from '../../data/bootstrap';
import { DataProvider } from '../../data/DataProvider';
import { loadTree } from '../../data/setlistService';
import { itemsOfBlock, sortedBlocks } from '../../core/setlistOps';

// pdf.js needs a real browser; the viewer is replaced by a marker here (checked for real in a browser).
vi.mock('../../components/PdfViewer', async () => {
  const React = await import('react');
  return { default: () => React.createElement('div', { 'data-testid': 'pdf-viewer' }) };
});

// The song page loads the (large) chord parser on demand: pay that cost once, before the tests.
beforeAll(async () => {
  await import('../SongPage');
}, 60_000);

const CHART =
  '{start_of_verse: Verse 1}\n[Em]Black hole [G]sun\nWon\'t you come\n{end_of_verse}\n{soc}\n[D/F#]Chorus [Am7]line\n{eoc}\n{c: play twice}';

let n = 0;
async function setup(path: (ctx: { songId: string; setlistId: string; firstItemId: string }) => string) {
  const store = createDexieStore({ dbName: `ui4-${++n}` });
  const band = await bootstrap(store);
  const setlist = (await store.setlists.listBy('bandId', band.id))[0]!;
  const tree = (await loadTree(store, setlist.id))!;
  const [firstItem] = sortedBlocks(tree).flatMap((b) => itemsOfBlock(tree, b.id));
  const song = (await store.songs.listBy('bandId', band.id)).find((s) => s.id === firstItem!.songId)!;
  await store.songs.update(song.id, { chordpro: CHART, key: 'Em', capo: 0 });
  const target = path({ songId: song.id, setlistId: setlist.id, firstItemId: firstItem!.id });
  render(
    <MemoryRouter initialEntries={[target]}>
      <DataProvider store={store}>
        <AppRoutes />
      </DataProvider>
    </MemoryRouter>,
  );
  return { store, band, setlist, song, tree };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const openControls = () => fireEvent.click(screen.getByRole('button', { name: 'Display controls' }));
/** The chords printed above the words (not the tuning pill, which also shows note names). */
const chordsShown = () => [...document.querySelectorAll('main .text-chord')].map((e) => e.textContent).filter((c) => c?.trim());

describe('song page', () => {
  it('shows chords above the words, sections and comments', async () => {
    await setup(({ songId }) => `/song/${songId}`);
    expect(await screen.findByRole('heading', { name: 'Fortunate Son' })).toBeTruthy();
    expect(chordsShown()).toEqual(['Em', 'G', 'D/F#', 'Am7']);
    expect(screen.getByText(/Black\s*$/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Verse 1' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Chorus' })).toBeTruthy(); // default label for {soc}
    expect(screen.getByText('play twice')).toBeTruthy();
    expect(screen.getByText(/Key Em/)).toBeTruthy();
  });

  it('transposes the chords and the key, and can reset', async () => {
    await setup(({ songId }) => `/song/${songId}`);
    await screen.findByRole('heading', { name: 'Fortunate Son' });
    openControls();
    fireEvent.click(screen.getByRole('button', { name: 'Transpose +1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Transpose +1' }));
    expect(chordsShown()).toEqual(['F#m', 'A', 'E/G#', 'Bm7']); // Em G D/F# Am7, two semitones up
    expect(screen.getByText(/Key F#m/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Transpose: +2' })); // tapping the value resets
    expect(chordsShown()).toEqual(['Em', 'G', 'D/F#', 'Am7']);
    expect(screen.getByText(/Key Em/)).toBeTruthy();
  });

  it('moving the capo changes the shapes, not the sound', async () => {
    await setup(({ songId }) => `/song/${songId}`);
    await screen.findByRole('heading', { name: 'Fortunate Son' });
    openControls();
    fireEvent.click(screen.getByRole('button', { name: 'Capo +1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Capo +1' }));
    expect(chordsShown()).toEqual(['Dm', 'F', 'C/E', 'Gm7']); // every shape two frets lower
    expect(screen.getByText(/Capo 2/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Capo −1' })).toBeTruthy();
  });

  it('toggles auto-scroll', async () => {
    await setup(({ songId }) => `/song/${songId}`);
    await screen.findByRole('heading', { name: 'Fortunate Son' });
    const play = screen.getByRole('button', { name: /Auto-scroll/ });
    fireEvent.click(play);
    expect(screen.getByRole('button', { name: /Pause/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /Pause/ }));
    expect(screen.getByRole('button', { name: /Auto-scroll/ }).getAttribute('aria-pressed')).toBe('false');
  });

  it('offers to add chords when the song has none', async () => {
    const { store, song } = await setup(({ songId }) => `/song/${songId}`);
    await screen.findByRole('heading', { name: 'Fortunate Son' });
    cleanup();
    await store.songs.update(song.id, { chordpro: '' });
    render(
      <MemoryRouter initialEntries={[`/song/${song.id}`]}>
        <DataProvider store={store}><AppRoutes /></DataProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('No chords or PDF for this song yet.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Add them' }).getAttribute('href')).toBe(`/library/${song.id}`);
  });

  it('switches between the chord sheet and the attached PDF', async () => {
    const { store, band, song } = await setup(({ songId }) => `/song/${songId}`);
    await screen.findByRole('heading', { name: 'Fortunate Son' });
    cleanup();
    await store.files.put({ id: 'pdf1', bandId: band.id, name: 'a.pdf', mimeType: 'application/pdf', size: 4, data: new Uint8Array([37, 80, 68, 70]).buffer, createdAt: 1, songId: song.id });
    render(
      <MemoryRouter initialEntries={[`/song/${song.id}`]}>
        <DataProvider store={store}><AppRoutes /></DataProvider>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Fortunate Son' });
    expect(screen.queryByTestId('pdf-viewer')).toBeNull(); // chords by default when there are some
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    expect(await screen.findByTestId('pdf-viewer')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Display controls' })).toBeNull(); // no transposing a PDF
    fireEvent.click(screen.getByRole('button', { name: 'Chords' }));
    expect(chordsShown()).toContain('Em');
  });
});

describe('inside a setlist', () => {
  const inSetlist = ({ setlistId, firstItemId }: { setlistId: string; firstItemId: string }) =>
    `/setlist/${setlistId}/song/${firstItemId}`;

  it('shows the position, the cue for the next song, and moves with the arrows', async () => {
    await setup(inSetlist);
    expect(await screen.findByRole('heading', { name: 'Fortunate Son' })).toBeTruthy();
    expect(screen.getByText(/Rock|CCR/)).toBeTruthy();
    expect(screen.getByText(/1 of 22/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Previous song' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/attacco diretto di/)).toBeTruthy(); // the transition cue
    expect(screen.getByRole('link', { name: /Next: Get Back/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next song' }));
    expect(await screen.findByRole('heading', { name: 'Get Back' })).toBeTruthy();
    expect(screen.getByText(/2 of 22/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Previous song' }));
    expect(await screen.findByRole('heading', { name: 'Fortunate Son' })).toBeTruthy();
  });

  it('survives a browser whose scrollTo returns a Promise (recent Chrome)', async () => {
    // Regression: the page reset its scroll with `useEffect(() => window.scrollTo(0, 0))`, so React received
    // that Promise as a cleanup function and crashed to a blank screen when moving to the next song.
    vi.spyOn(window, 'scrollTo').mockImplementation((() => Promise.resolve()) as never);
    await setup(inSetlist);
    await screen.findByRole('heading', { name: 'Fortunate Son' });
    fireEvent.click(screen.getByRole('button', { name: 'Next song' }));
    expect(await screen.findByRole('heading', { name: 'Get Back' })).toBeTruthy();
  });

  it('moves to the next song with a swipe, and ignores vertical scrolling', async () => {
    await setup(inSetlist);
    await screen.findByRole('heading', { name: 'Fortunate Son' });
    const main = document.querySelector('main')!;

    fireEvent.touchStart(main, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchEnd(main, { changedTouches: [{ clientX: 290, clientY: 400 }] });
    expect(screen.getByRole('heading', { name: 'Fortunate Son' })).toBeTruthy(); // a scroll, not a swipe

    fireEvent.touchStart(main, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchEnd(main, { changedTouches: [{ clientX: 100, clientY: 110 }] });
    expect(await screen.findByRole('heading', { name: 'Get Back' })).toBeTruthy();
  });

  it('opens from a setlist row', async () => {
    const { setlist } = await setup(({ setlistId }) => `/setlist/${setlistId}`);
    const link = await screen.findByRole('link', { name: /Fortunate Son/ });
    expect(link.getAttribute('href')).toMatch(new RegExp(`^/setlist/${setlist.id}/song/`));
  });
});

describe('library and form', () => {
  it('opens the song page from the library list', async () => {
    const { song } = await setup(() => '/library');
    const link = await screen.findByRole('link', { name: /Fortunate Son/ });
    expect(link.getAttribute('href')).toBe(`/song/${song.id}`);
  });

  it('converts pasted "chords over words" text into ChordPro in the song form', async () => {
    const { store, song } = await setup(({ songId }) => `/library/${songId}`);
    await screen.findByLabelText(/Lyrics and chords/);
    fireEvent.click(screen.getByRole('button', { name: /Convert/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Paste chords above the words/), {
      target: { value: 'Am             F\nSome lyrics go right here\nLa la la' },
    });
    expect((within(dialog).getByLabelText('ChordPro result') as HTMLTextAreaElement).value).toBe(
      '[Am]Some lyrics go [F]right here\nLa la la',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Replace text' }));
    expect((screen.getByLabelText(/Lyrics and chords/) as HTMLTextAreaElement).value).toBe(
      '[Am]Some lyrics go [F]right here\nLa la la',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () =>
      expect((await store.songs.get(song.id))?.chordpro).toBe('[Am]Some lyrics go [F]right here\nLa la la'),
    );
  });

  it('appends instead of replacing when asked', async () => {
    await setup(({ songId }) => `/library/${songId}`);
    await screen.findByLabelText(/Lyrics and chords/);
    fireEvent.click(screen.getByRole('button', { name: /Convert/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Paste chords above the words/), { target: { value: 'C\nHello' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add at the end' }));
    const text = (screen.getByLabelText(/Lyrics and chords/) as HTMLTextAreaElement).value;
    expect(text.startsWith('{start_of_verse: Verse 1}')).toBe(true);
    expect(text.endsWith('[C]Hello')).toBe(true);
  });
});
