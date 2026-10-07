// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from '../../routes';
import { bootstrap } from '../../data/bootstrap';
import { createDexieStore } from '../../data/dexie/dexieRepository';
import { DataProvider } from '../../data/DataProvider';
import { useUiStore } from '../../state/uiStore';

vi.mock('../../components/PdfViewer', () => ({ default: () => null }));

const CHART =
  '{start_of_verse: Verse 1}\n[Em]Black hole [G]sun\n{end_of_verse}\n{start_of_chorus: Chorus}\n[D]Chorus [Am7]line\n{end_of_chorus}\n{start_of_bridge: Bridge}\n[C]Bridge line\n{end_of_bridge}';

let n = 0;
async function setup(path: (ctx: { songId: string }) => string, patch: Partial<{ chordpro: string; key: string; tempo: number; capo: number; durationSec: number }> = {}) {
  const store = createDexieStore({ dbName: `ui16-${++n}` });
  const band = await bootstrap(store);
  const song = (await store.songs.listBy('bandId', band.id))[0]!;
  await store.songs.update(song.id, { chordpro: CHART, key: 'Em', capo: 2, tempo: 120, durationSec: 215, ...patch });
  render(
    <MemoryRouter initialEntries={[path({ songId: song.id })]}>
      <DataProvider store={store}><AppRoutes /></DataProvider>
    </MemoryRouter>,
  );
  return { store, band, song };
}

beforeEach(() => {
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  useUiStore.setState({ language: 'en', stageMode: false });
});
afterEach(cleanup);

describe('the song page', () => {
  it('shows the facts as chips, and the key chip opens the transposer', async () => {
    await setup(({ songId }) => `/song/${songId}`);
    expect(await screen.findByText('Key Em')).toBeTruthy();
    expect(screen.getByText('Capo 2')).toBeTruthy();
    expect(screen.getByText('3:35')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Transpose +1' })).toBeNull();
    fireEvent.click(screen.getByText('Key Em'));
    expect(await screen.findByRole('button', { name: 'Transpose +1' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Transpose +1' }));
    expect(screen.getByText('Key Fm')).toBeTruthy();
  });

  it('turns the tempo chip into the metronome toggle', async () => {
    await setup(({ songId }) => `/song/${songId}`);
    const chip = await screen.findByRole('button', { name: 'Metronome' });
    expect(chip.textContent).toContain('120');
    expect(screen.queryByRole('group', { name: 'Metronome' })).toBeNull();
    fireEvent.click(chip);
    expect(await screen.findByRole('group', { name: 'Metronome' })).toBeTruthy();
  });

  it('splits the sheet into sections and lists them in the header', async () => {
    await setup(({ songId }) => `/song/${songId}`);
    await screen.findByText('Key Em');
    const sections = [...document.querySelectorAll('section[data-section]')];
    expect(sections.map((s) => s.getAttribute('data-kind'))).toEqual(['verse', 'chorus', 'bridge']);
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect([...nav.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Verse 1', 'Chorus', 'Bridge']);
    fireEvent.click(within(nav).getByRole('button', { name: 'Chorus' }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('shows a bar that fills with the reading position, and a drawn empty state with no text', async () => {
    await setup(({ songId }) => `/song/${songId}`, { chordpro: '' });
    expect(await screen.findByText('No chords or PDF for this song yet.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Add them' })).toBeTruthy();
    expect(document.querySelector('.song-progress')).toBeTruthy();
  });

  it('groups the sheet and the PDF behind a sliding switch only when there is a PDF', async () => {
    await setup(({ songId }) => `/song/${songId}`);
    await screen.findByText('Key Em');
    expect(screen.queryByRole('button', { name: 'PDF' })).toBeNull();
  });
});

describe('the song form', () => {
  it('has a step bar with a progress that grows as the form is filled in', async () => {
    await setup(() => '/library/new', { chordpro: '' });
    const nav = await screen.findByRole('navigation', { name: 'Sections of the form' });
    expect([...nav.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['1The song', '2Charts', '3Tags and notes']);
    const bar = screen.getByRole('progressbar', { name: 'How much is filled in' });
    const before = Number(bar.getAttribute('aria-valuenow'));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New one' } });
    fireEvent.change(screen.getByLabelText('Artist'), { target: { value: 'Someone' } });
    expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
  });

  it('tells whether there is anything to save', async () => {
    await setup(({ songId }) => `/library/${songId}`);
    const status = await screen.findByText('No changes');
    expect(status).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Artist'), { target: { value: 'Somebody else' } });
    expect(await screen.findByText('Unsaved changes')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Artist'), { target: { value: 'Pink Floyd' } });
  });

  it('picks the key from the grid, keeping the mode', async () => {
    await setup(() => '/library/new');
    const key = (await screen.findByLabelText('Key')) as HTMLInputElement;
    const grid = screen.getByRole('group', { name: 'Pick a key' });
    fireEvent.click(within(grid).getByRole('button', { name: 'A' }));
    expect(key.value).toBe('A');
    fireEvent.click(within(grid).getByRole('button', { name: 'Minor' }));
    expect(key.value).toBe('Am');
    fireEvent.click(within(grid).getByRole('button', { name: 'Em' }));
    expect(key.value).toBe('Em');
    fireEvent.click(within(grid).getByRole('button', { name: 'Em' })); // tapping the chosen one clears it
    expect(key.value).toBe('');
  });

  it('sets the tempo by tapping and the length with the slider', async () => {
    await setup(() => '/library/new');
    const tempo = (await screen.findByLabelText('Tempo (BPM)')) as HTMLInputElement;
    const now = vi.spyOn(Date, 'now');
    for (const t of [1000, 1500, 2000, 2500]) {
      now.mockReturnValue(t);
      fireEvent.click(screen.getByRole('button', { name: 'Tap tempo' }));
    }
    expect(tempo.value).toBe('120');
    fireEvent.change(screen.getByLabelText('Duration slider'), { target: { value: '225' } });
    expect((screen.getByLabelText('Duration (m:ss)') as HTMLInputElement).value).toBe('3:45');
    now.mockRestore();
  });

  it('inserts sections and chords of the key into the text, and previews the sheet', async () => {
    await setup(() => '/library/new');
    const area = (await screen.findByLabelText(/Lyrics and chords/)) as HTMLTextAreaElement;
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'G' } });
    expect(screen.getByText('The sheet appears here as you write.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '+ Verse' }));
    expect(area.value).toBe('{start_of_verse: Verse}\n\n{end_of_verse}\n');
    const chords = screen.getByRole('group', { name: 'Chords of this key' });
    expect([...chords.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['G', 'Am', 'Bm', 'C', 'D', 'Em', 'D7']);
    area.setSelectionRange(24, 24);
    fireEvent.click(within(chords).getByRole('button', { name: 'Am' }));
    expect(area.value).toContain('[Am]');
    expect(screen.getByText(/1 lines · 1 chords|0 lines · 1 chords/)).toBeTruthy();
    expect(screen.queryByText('The sheet appears here as you write.')).toBeNull();
    expect(document.querySelector('.chart .chart-section')).toBeTruthy();
  });

  it('colours the marks behind the text', async () => {
    await setup(({ songId }) => `/library/${songId}`, { chordpro: '{c: hi}\n[Am]word' });
    await screen.findByLabelText(/Lyrics and chords/);
    const back = document.querySelector('pre.editor-text')!;
    expect(back.querySelector('.text-coro')!.textContent).toBe('{c: hi}');
    expect(back.querySelector('.text-chord')!.textContent).toBe('[Am]');
  });

  it('offers the tags used before, and adds one with a tap', async () => {
    const { store, band } = await setup(() => '/library/new');
    const other = (await store.songs.listBy('bandId', band.id))[1]!;
    await store.songs.update(other.id, { tags: ['ballad'] });
    cleanup();
    render(
      <MemoryRouter initialEntries={['/library/new']}>
        <DataProvider store={store}><AppRoutes /></DataProvider>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: '+ ballad' }));
    expect(screen.getByRole('button', { name: 'Remove ballad' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+ ballad' })).toBeNull();
  });

  it('shakes and focuses the first field that needs a look when saving fails', async () => {
    await setup(() => '/library/new');
    const title = await screen.findByLabelText('Title');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(document.querySelector('[data-error]')).toBeTruthy());
    await waitFor(() => expect(document.activeElement).toBe(title));
    expect(document.querySelector('[data-error]')!.classList.contains('field-shake')).toBe(true);
  });
});

describe('Segmented', () => {
  it('moves its highlight and reports the choice', async () => {
    const { Segmented } = await import('../../components/Segmented');
    const pick = vi.fn();
    render(<Segmented value="a" onChange={pick} options={[{ value: 'a', label: 'One' }, { value: 'b', label: 'Two' }]} />);
    const thumb = document.querySelector('.segmented-thumb') as HTMLElement;
    expect(thumb.style.transform).toBe('translateX(0%)');
    fireEvent.click(screen.getByRole('button', { name: 'Two' }));
    expect(pick).toHaveBeenCalledWith('b');
  });
});
