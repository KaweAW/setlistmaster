// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from '../../routes';
import { createDexieStore } from '../../data/dexie/dexieRepository';
import { bootstrap } from '../../data/bootstrap';
import { DataProvider } from '../../data/DataProvider';

let n = 0;
async function setup(path: string) {
  const store = createDexieStore({ dbName: `ui-${++n}` });
  const band = await bootstrap(store);
  render(
    <MemoryRouter initialEntries={[path]}>
      <DataProvider store={store}>
        <AppRoutes />
      </DataProvider>
    </MemoryRouter>,
  );
  return { store, band };
}

afterEach(cleanup);

describe('library', () => {
  it('lists the seeded songs and filters by search', async () => {
    await setup('/library');
    expect(await screen.findByText('25 songs')).toBeTruthy();
    expect(screen.getByText('Спокойная ночь')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Search title or artist'), { target: { value: 'radiohead' } });
    expect(await screen.findByText('3 songs')).toBeTruthy();
    expect(screen.queryByText('Fortunate Son')).toBeNull();
  });

  it('filters by tuning', async () => {
    const { store, band } = await setup('/library');
    await screen.findByText('25 songs');
    const tunings = await store.tunings.listBy('bandId', band.id);
    const drop = tunings.find((x) => x.name === 'Drop D')!;
    fireEvent.change(screen.getByLabelText('All tunings'), { target: { value: drop.id } });
    expect(await screen.findByText('1 song')).toBeTruthy();
    expect(screen.getByText('The Chain')).toBeTruthy();
  });
});

describe('song form', () => {
  it('creates a song with every field, including a tuning created on the fly and a PDF', async () => {
    const { store, band } = await setup('/library/new');
    const title = await screen.findByLabelText('Title');

    // required title
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Required.')).toBeTruthy();

    fireEvent.change(title, { target: { value: 'Black Hole Sun' } });
    fireEvent.change(screen.getByLabelText('Artist'), { target: { value: 'Soundgarden' } });
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'Em' } });
    fireEvent.change(screen.getByLabelText('Capo'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Tempo (BPM)'), { target: { value: '102' } });
    fireEvent.change(screen.getByLabelText('Duration (m:ss)'), { target: { value: '5:18' } });

    // tuning created on the fly
    fireEvent.change(screen.getByLabelText('Tuning'), { target: { value: '__new__' } });
    await screen.findByRole('heading', { name: 'New tuning' });
    const form = document.body;
    const nameInputs = within(form).getAllByLabelText('Name');
    fireEvent.change(nameInputs[0]!, { target: { value: 'Drop C' } });
    fireEvent.change(within(form).getByLabelText('Notes (e.g. D-G-C-F-A-D)'), { target: { value: 'C G C F A D' } });
    fireEvent.click(within(form).getAllByRole('button', { name: 'Save' })[0]!);
    await waitFor(async () => expect((await store.tunings.listBy('bandId', band.id)).some((x) => x.name === 'Drop C')).toBe(true));

    // performers, tags, chords, notes
    fireEvent.click(screen.getByRole('button', { name: /Kawe/ }));
    const tagInput = screen.getByLabelText('Tags');
    fireEvent.change(tagInput, { target: { value: 'grunge' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });
    fireEvent.change(screen.getByLabelText(/Lyrics and chords/), { target: { value: '[Em]Black hole [G]sun' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'slow intro' } });

    // PDF
    const file = new File([new Uint8Array([37, 80, 68, 70])], 'sun.pdf', { type: 'application/pdf' });
    // jsdom lacks File.arrayBuffer in some versions
    if (!file.arrayBuffer) Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array([37, 80, 68, 70]).buffer });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(await screen.findByText(/sun\.pdf/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      const songs = await store.songs.listBy('bandId', band.id);
      expect(songs).toHaveLength(26);
    });
    const saved = (await store.songs.listBy('bandId', band.id)).find((s) => s.title === 'Black Hole Sun')!;
    const tunings = await store.tunings.listBy('bandId', band.id);
    expect(saved).toMatchObject({
      artist: 'Soundgarden', key: 'Em', capo: 2, tempo: 102, durationSec: 318,
      chordpro: '[Em]Black hole [G]sun', notes: 'slow intro', tags: ['grunge'],
    });
    expect(tunings.find((x) => x.id === saved.tuningId)?.name).toBe('Drop C');
    expect(saved.defaultPerformerIds).toHaveLength(1);
    const stored = await store.files.listBySong(saved.id);
    expect(stored.map((f) => [f.name, f.instrumentId])).toEqual([['sun.pdf', undefined]]);
  });

  it('rejects an invalid duration', async () => {
    await setup('/library/new');
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Duration (m:ss)'), { target: { value: '345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Use minutes and seconds, like 3:45.')).toBeTruthy();
  });

  it('edits an existing song', async () => {
    const { store, band } = await setup('/library');
    await screen.findByText('25 songs');
    const creep = (await store.songs.listBy('bandId', band.id)).find((s) => s.title === 'Creep')!;
    cleanup();
    render(
      <MemoryRouter initialEntries={[`/library/${creep.id}`]}>
        <DataProvider store={store}><AppRoutes /></DataProvider>
      </MemoryRouter>,
    );
    const artist = await screen.findByLabelText('Artist');
    expect((artist as HTMLInputElement).value).toBe('Radiohead');
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'G' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect((await store.songs.get(creep.id))?.key).toBe('G'));
  });

  it('blocks deleting a song used in a setlist', async () => {
    const { store, band } = await setup('/library');
    await screen.findByText('25 songs');
    const creep = (await store.songs.listBy('bandId', band.id)).find((s) => s.title === 'Creep')!;
    cleanup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <MemoryRouter initialEntries={[`/library/${creep.id}`]}>
        <DataProvider store={store}><AppRoutes /></DataProvider>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(await store.songs.get(creep.id)).toBeTruthy();
  });
});

describe('settings', () => {
  it('adds a singer and blocks deleting one in use', async () => {
    const { store, band } = await setup('/settings');
    await screen.findByText('Julie');

    fireEvent.click(screen.getByRole('button', { name: '+ Add singer' }));
    fireEvent.change(screen.getAllByLabelText('Name').at(-1)!, { target: { value: 'Alex' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' }).at(-1)!);
    await waitFor(async () => expect((await store.performers.listBy('bandId', band.id)).some((p) => p.name === 'Alex')).toBe(true));

    const julieRow = (await screen.findByText('Julie')).closest('li')!;
    fireEvent.click(within(julieRow).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(/Cannot delete/)).toBeTruthy();
  });
});
