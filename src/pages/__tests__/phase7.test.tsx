// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from '../../routes';
import { createBackup, parseBackup } from '../../core/backup';
import { bootstrap } from '../../data/bootstrap';
import { DataProvider } from '../../data/DataProvider';
import { createDexieStore } from '../../data/dexie/dexieRepository';
import { addDefaultInstruments, partId } from '../../data/instruments';
import { useUiStore } from '../../state/uiStore';

vi.mock('../../components/PdfViewer', () => ({ default: () => null }));

beforeAll(async () => {
  await import('../SongPage');
}, 60_000);

let n = 0;
beforeEach(() => {
  window.scrollTo = vi.fn();
  useUiStore.setState({ language: 'en', stageMode: false, activeBandId: null, myInstruments: {} });
});
afterEach(cleanup);

async function setup(path: string | ((ctx: { songId: string }) => string)) {
  const store = createDexieStore({ dbName: `ui7-${++n}` });
  const band = await bootstrap(store, undefined, null, 'en');
  const song = (await store.songs.listBy('bandId', band.id))[0]!;
  const target = typeof path === 'string' ? path : path({ songId: song.id });
  render(
    <MemoryRouter initialEntries={[target]}>
      <DataProvider store={store}>
        <AppRoutes />
      </DataProvider>
    </MemoryRouter>,
  );
  return { store, band, song };
}

describe('default instruments', () => {
  it('gives every band lead, rhythm and bass once, and never brings back one that was deleted', async () => {
    const store = createDexieStore({ dbName: `ui7-${++n}` });
    const band = await bootstrap(store, undefined, null, 'it');
    expect((await store.instruments.listBy('bandId', band.id)).map((i) => i.name).sort()).toEqual(['Basso', 'Chitarra lead', 'Chitarra ritmica']);
    const bass = (await store.instruments.listBy('bandId', band.id)).find((i) => i.name === 'Basso')!;
    await store.instruments.remove(bass.id);
    await addDefaultInstruments(store, band.id, 'it');
    await bootstrap(store, undefined, null, 'it');
    expect(await store.instruments.listBy('bandId', band.id)).toHaveLength(2);
  });
});

describe('instruments in the settings', () => {
  it('lists them, adds one, and refuses to delete one that songs use', async () => {
    const { store, band, song } = await setup('/settings');
    const heading = await screen.findByRole('heading', { name: 'Instruments' });
    const section = heading.closest('section')!;
    const names = () => within(section).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(names().some((x) => x.startsWith('Lead guitar'))).toBe(true);

    const lead = (await store.instruments.listBy('bandId', band.id)).find((i) => i.name === 'Lead guitar')!;
    await store.songs.update(song.id, { instrumentIds: [lead.id] });
    fireEvent.click(within(section).getByRole('button', { name: '+ Add instrument' })); // saving reloads the list, which now sees the song
    fireEvent.change(within(section).getByLabelText('Name'), { target: { value: 'Piano' } });
    fireEvent.click(within(section).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(names().some((x) => x.startsWith('Piano'))).toBe(true));
    expect((await store.instruments.listBy('bandId', band.id)).map((i) => i.name)).toContain('Piano');

    fireEvent.click(within(section).getAllByRole('button', { name: 'Delete' })[0]!);
    expect(await within(section).findByRole('alert')).toBeTruthy();
    expect(await store.instruments.get(lead.id)).toBeTruthy();
  });

  it('remembers the instrument I play', async () => {
    const { store, band } = await setup('/settings');
    const select = (await screen.findByLabelText('The instrument I play')) as HTMLSelectElement;
    const bass = (await store.instruments.listBy('bandId', band.id)).find((i) => i.name === 'Bass')!;
    fireEvent.change(select, { target: { value: bass.id } });
    await waitFor(() => expect(useUiStore.getState().myInstruments[band.id]).toBe(bass.id));
  });
});

describe('parts of a song', () => {
  it('are written in the song form and shown as tabs, opening on my instrument', async () => {
    const { store, band, song } = await setup(({ songId }) => `/library/${songId}`);
    const bass = (await store.instruments.listBy('bandId', band.id)).find((i) => i.name === 'Bass')!;
    await screen.findByLabelText('Title');
    fireEvent.click(screen.getByRole('button', { name: 'Bass' }));
    fireEvent.change(await screen.findByLabelText('Chart for Bass (ChordPro)'), { target: { value: '[E]walk [A]down' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => expect((await store.songs.get(song.id))!.instrumentIds).toEqual([bass.id]));
    const parts = await store.parts.listBy('songId', song.id);
    expect(parts).toHaveLength(1);
    expect(parts[0]!.id).toBe(await partId(band.id, song.id, bass.id));
    expect(parts[0]!.chordpro).toBe('[E]walk [A]down');
  });

  it('shows the text tab by default and the part when it is my instrument', async () => {
    const store = createDexieStore({ dbName: `ui7-${++n}` });
    const band = await bootstrap(store, undefined, null, 'en');
    const song = (await store.songs.listBy('bandId', band.id))[0]!;
    const bass = (await store.instruments.listBy('bandId', band.id)).find((i) => i.name === 'Bass')!;
    await store.songs.update(song.id, { chordpro: '[Em]plain text', instrumentIds: [bass.id] });
    await store.parts.create({ id: await partId(band.id, song.id, bass.id), bandId: band.id, songId: song.id, instrumentId: bass.id, chordpro: '[E]bass line', notes: '' });

    const view = () =>
      render(
        <MemoryRouter initialEntries={[`/song/${song.id}`]}>
          <DataProvider store={store}><AppRoutes /></DataProvider>
        </MemoryRouter>,
      );
    view();
    const tabs = await screen.findByRole('tablist');
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Text', 'Bass']);
    expect(screen.getByText('plain')).toBeTruthy();
    fireEvent.click(within(tabs).getByRole('tab', { name: 'Bass' }));
    expect(await screen.findByText('line', { exact: false })).toBeTruthy();
    expect(screen.queryByText('plain')).toBeNull();

    cleanup();
    useUiStore.setState({ myInstruments: { [band.id]: bass.id } });
    view();
    expect((await screen.findByRole('tab', { name: 'Bass' })).getAttribute('aria-selected')).toBe('true');
  });

  it('travel in a backup', async () => {
    const store = createDexieStore({ dbName: `ui7-${++n}` });
    const band = await bootstrap(store, undefined, null, 'en');
    const song = (await store.songs.listBy('bandId', band.id))[0]!;
    const bass = (await store.instruments.listBy('bandId', band.id))[0]!;
    await store.parts.create({ bandId: band.id, songId: song.id, instrumentId: bass.id, chordpro: '[E]x', notes: '' });
    const text = JSON.stringify(createBackup(await store.bulk.readAll(), 1));
    const parsed = parseBackup(text);
    expect(parsed.ok && parsed.snapshot.parts).toHaveLength(1);
    expect(parsed.ok && parsed.snapshot.instruments).toHaveLength(3);
    // an old (version 1) backup has neither, and still loads
    const old = JSON.parse(text) as { version: number; data: Record<string, unknown> };
    old.version = 1;
    delete old.data.instruments;
    delete old.data.parts;
    const loaded = parseBackup(JSON.stringify(old));
    expect(loaded.ok && loaded.snapshot.instruments).toEqual([]);
  });
});
