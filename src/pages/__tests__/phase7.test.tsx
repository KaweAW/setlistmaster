// @vitest-environment jsdom
import { choose, shown } from '../../components/__tests__/choose';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from '../../routes';
import { createBackup, parseBackup } from '../../core/backup';
import { bootstrap } from '../../data/bootstrap';
import { DataProvider } from '../../data/DataProvider';
import { createDexieStore } from '../../data/dexie/dexieRepository';
import { addAttachment, songAttachments } from '../../data/attachments';
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
    const bass = (await store.instruments.listBy('bandId', band.id)).find((i) => i.name === 'Bass')!;
    await choose('The instrument I play', bass.id);
    await waitFor(() => expect(useUiStore.getState().myInstruments[band.id]).toBe(bass.id));
  });
});

describe('PDFs of a part', () => {
  const pdfFile = (name: string) => {
    const file = new File([new Uint8Array([37, 80, 68, 70])], name, { type: 'application/pdf' });
    if (!file.arrayBuffer) Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array([37, 80, 68, 70]).buffer });
    return file;
  };

  it('are added several at a time, to the text and to an instrument, and removed again', async () => {
    const { store, band, song } = await setup(({ songId }) => `/library/${songId}`);
    const bass = (await store.instruments.listBy('bandId', band.id)).find((i) => i.name === 'Bass')!;
    await screen.findByLabelText('Title');
    await choose('Add instrument', bass.id); // opens the Bass tab
    fireEvent.change(await screen.findByLabelText('Add PDF for Bass'), { target: { files: [pdfFile('bass1.pdf'), pdfFile('bass2.pdf')] } });
    expect(await screen.findByText(/bass2\.pdf/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Text' }));
    fireEvent.change(await screen.findByLabelText('Add PDF for the text'), { target: { files: [pdfFile('text.pdf')] } });
    expect(await screen.findByText(/text\.pdf/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => expect(await songAttachments(store, song.id)).toHaveLength(3));
    const files = await songAttachments(store, song.id);
    expect(files.filter((f) => f.instrumentId === bass.id).map((f) => f.name).sort()).toEqual(['bass1.pdf', 'bass2.pdf']);
    expect(files.filter((f) => f.instrumentId === undefined).map((f) => f.name)).toEqual(['text.pdf']);
  });

  it('are chosen from a list on the song page, per part', async () => {
    const store = createDexieStore({ dbName: `ui7-${++n}` });
    const band = await bootstrap(store, undefined, null, 'en');
    const song = (await store.songs.listBy('bandId', band.id))[0]!;
    const bass = (await store.instruments.listBy('bandId', band.id)).find((i) => i.name === 'Bass')!;
    await store.songs.update(song.id, { instrumentIds: [bass.id] });
    const put = (id: string, name: string, instrumentId?: string) =>
      addAttachment(store, { id, bandId: band.id, songId: song.id, instrumentId, name, data: new Uint8Array([37]).buffer });
    await put('f1', 'text.pdf');
    await put('f2', 'bass-a.pdf', bass.id);
    await put('f3', 'bass-b.pdf', bass.id);
    render(
      <MemoryRouter initialEntries={[`/song/${song.id}`]}>
        <DataProvider store={store}><AppRoutes /></DataProvider>
      </MemoryRouter>,
    );
    await choose('Part', bass.id);
    fireEvent.click(await screen.findByLabelText('PDF of this part', { selector: 'button' }));
    const list = await screen.findByRole('listbox', { name: 'PDF of this part' });
    expect([...list.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual(['bass-a.pdf', 'bass-b.pdf']);
    fireEvent.click(list.querySelector('[data-value="f3"]')!);
    await waitFor(async () => expect(await shown('PDF of this part')).toBe('bass-b.pdf'));
    await choose('Part', 'text');
    expect(screen.queryByLabelText('PDF of this part')).toBeNull(); // one PDF: nothing to choose
  });

  it('are tagged with their song when an old backup is read', () => {
    const base = { bandId: 'b', createdAt: 1, updatedAt: 1 };
    const old = {
      format: 'scaletta-backup', version: 2, exportedAt: 1,
      data: {
        bands: [{ id: 'b', createdAt: 1, updatedAt: 1, name: 'B' }],
        songs: [{ ...base, id: 's1', title: 'X', tuningId: 't', pdfBlobId: 'f1' }],
        files: [{ id: 'f1', bandId: 'b', name: 'a.pdf', mimeType: 'application/pdf', size: 1, createdAt: 1, dataBase64: 'JQ==' }],
      },
    };
    const parsed = parseBackup(JSON.stringify(old));
    expect(parsed.ok && parsed.snapshot.files[0]?.songId).toBe('s1');
  });
});

describe('parts of a song', () => {
  it('are written in the song form and shown as tabs, opening on my instrument', async () => {
    const { store, band, song } = await setup(({ songId }) => `/library/${songId}`);
    const bass = (await store.instruments.listBy('bandId', band.id)).find((i) => i.name === 'Bass')!;
    await screen.findByLabelText('Title');
    await choose('Add instrument', bass.id);
    fireEvent.change(await screen.findByLabelText('Chart for Bass (ChordPro)'), { target: { value: '[E]walk [A]down' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => expect((await store.songs.get(song.id))!.instrumentIds).toEqual([bass.id]));
    await waitFor(async () => expect(await store.parts.listBy('songId', song.id)).toHaveLength(1)); // written after the song
    const parts = await store.parts.listBy('songId', song.id);
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
    fireEvent.click(await screen.findByLabelText('Part', { selector: 'button' }));
    const list = await screen.findByRole('listbox', { name: 'Part' });
    expect([...list.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual(['Only text', 'Bass']);
    fireEvent.keyDown(list.parentElement!, { key: 'Escape' });
    expect(await shown('Part')).toBe('Only text');
    expect(screen.getByText('plain')).toBeTruthy();
    await choose('Part', bass.id);
    expect(await screen.findByText('line', { exact: false })).toBeTruthy();
    expect(screen.queryByText('plain')).toBeNull();

    cleanup();
    useUiStore.setState({ myInstruments: { [band.id]: bass.id } });
    view();
    expect(await shown('Part')).toBe('Bass');
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

describe('the song form, part by part', () => {
  it('keeps one tab per part, each with its own text, and removes a part on request', async () => {
    const { store, band, song } = await setup(({ songId }) => `/library/${songId}`);
    const bass = (await store.instruments.listBy('bandId', band.id)).find((i) => i.name === 'Bass')!;
    await screen.findByLabelText('Title');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Text']);
    await choose('Add instrument', bass.id);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Text', 'Bass']);
    fireEvent.change(await screen.findByLabelText('Chart for Bass (ChordPro)'), { target: { value: '{start_of_tab}\ne|--0--|\n{end_of_tab}' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Text' }));
    expect(screen.queryByLabelText('Chart for Bass (ChordPro)')).toBeNull(); // only the open part is on screen
    fireEvent.click(screen.getByRole('tab', { name: 'Bass' }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Remove the Bass part' }));
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Text']);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect((await store.songs.get(song.id))!.instrumentIds).toEqual([]));
    expect(await store.parts.listBy('songId', song.id)).toEqual([]);
  });
});

describe('sticky notes', () => {
  it('are added from the song form and shown on the song page', async () => {
    const { store, band, song } = await setup(({ songId }) => `/library/${songId}`);
    await store.songs.update(song.id, { chordpro: '[Em]first line\n[G]second line' });
    await screen.findByLabelText('Title');
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Pink' }));
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Wait for Alex' } });
    fireEvent.click(screen.getByRole('button', { name: 'Put it in the text' }));
    const area = screen.getByLabelText('Lyrics and chords (ChordPro)') as HTMLTextAreaElement;
    expect(area.value).toContain('{note_pink: Wait for Alex}');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect((await store.songs.get(song.id))!.chordpro).toContain('{note_pink: Wait for Alex}'));
    cleanup();

    render(
      <MemoryRouter initialEntries={[`/song/${song.id}`]}>
        <DataProvider store={store}><AppRoutes /></DataProvider>
      </MemoryRouter>,
    );
    const note = await screen.findByText('Wait for Alex');
    expect(note.className).toContain('sticky-note--pink');
    expect(band.id).toBeTruthy();
  });
});
