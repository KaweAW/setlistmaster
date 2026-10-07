// @vitest-environment jsdom
import { choose } from '../../components/__tests__/choose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from '../../routes';
import { createDexieStore } from '../../data/dexie/dexieRepository';
import { bootstrap } from '../../data/bootstrap';
import { DataProvider } from '../../data/DataProvider';
import { loadTree } from '../../data/setlistService';

let n = 0;
async function setup(path: string) {
  const store = createDexieStore({ dbName: `ui2-${++n}` });
  const band = await bootstrap(store);
  const setlist = (await store.setlists.listBy('bandId', band.id))[0]!;
  const target = path.replace(':id', setlist.id);
  render(
    <MemoryRouter initialEntries={[target]}>
      <DataProvider store={store}>
        <AppRoutes />
      </DataProvider>
    </MemoryRouter>,
  );
  return { store, band, setlist };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('home', () => {
  it('lists the setlists with their song count', async () => {
    await setup('/');
    expect(await screen.findByText('Scaletta live')).toBeTruthy();
    expect(screen.getByText('22 songs')).toBeTruthy();
  });

  it('creates a new setlist and opens it in edit mode', async () => {
    const { store, band } = await setup('/');
    await screen.findByText('Scaletta live');
    fireEvent.click(screen.getByRole('button', { name: 'New setlist' }));
    expect(await screen.findByRole('button', { name: /Undo/ })).toBeTruthy(); // edit toolbar
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('New setlist');
    expect(await store.setlists.listBy('bandId', band.id)).toHaveLength(2);
  });

  it('duplicates, archives and deletes', async () => {
    const { store, band } = await setup('/');
    await screen.findByText('Scaletta live');
    fireEvent.click(screen.getByRole('button', { name: /Actions: Scaletta live/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(await screen.findByText('Scaletta live (copy)')).toBeTruthy();
    expect(await store.setlists.listBy('bandId', band.id)).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /Actions: Scaletta live \(copy\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(screen.queryByText('Scaletta live (copy)')).toBeNull());
    expect(screen.getByRole('button', { name: 'Show archived (1)' })).toBeTruthy();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /Actions: Scaletta live$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(async () => expect(await store.setlists.listBy('bandId', band.id)).toHaveLength(1));
  });
});

describe('setlist page', () => {
  it('shows the prototype setlist read-only, with a computed legend', async () => {
    await setup('/setlist/:id');
    expect(await screen.findByRole('heading', { name: 'Scaletta live' })).toBeTruthy();
    expect(screen.getByText('Fortunate Son')).toBeTruthy();
    expect(screen.getByText('Спокойная ночь')).toBeTruthy();
    // legend: singers used, tuning, segue and stop all occur in the prototype
    for (const label of ['Julie', 'Kawe', 'Coro', 'Different tuning', 'Direct segue', 'Hard stop']) {
      expect(screen.getAllByText(new RegExp(label)).length).toBeGreaterThan(0);
    }
    // the tuning chip uses the unified format
    expect(screen.getAllByText('D').length).toBeGreaterThan(0);
    // no editing controls in the clean view
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull();
    expect(screen.queryByLabelText('Drag to move the song')).toBeNull();
  });

  it('edits blocks with undo and redo, saving as it goes', async () => {
    const { store, setlist } = await setup('/setlist/:id');
    await screen.findByRole('heading', { name: 'Scaletta live' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    fireEvent.click(await screen.findByRole('button', { name: '+ Add block' }));
    await waitFor(async () => expect((await loadTree(store, setlist.id))!.blocks).toHaveLength(6));

    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    await waitFor(async () => expect((await loadTree(store, setlist.id))!.blocks).toHaveLength(5));

    fireEvent.click(screen.getByRole('button', { name: /Redo/ }));
    await waitFor(async () => expect((await loadTree(store, setlist.id))!.blocks).toHaveLength(6));
  });

  it('renames a block when the field loses focus', async () => {
    const { store, setlist } = await setup('/setlist/:id');
    await screen.findByRole('heading', { name: 'Scaletta live' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const names = await screen.findAllByLabelText('Block name');
    fireEvent.change(names[0]!, { target: { value: 'Opening' } });
    fireEvent.blur(names[0]!);
    await waitFor(async () =>
      expect((await loadTree(store, setlist.id))!.blocks.some((b) => b.name === 'Opening')).toBe(true),
    );
  });

  it('edits a song in the setlist as a single step', async () => {
    const { store, setlist } = await setup('/setlist/:id');
    await screen.findByRole('heading', { name: 'Scaletta live' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(await screen.findByRole('button', { name: /Fortunate Son/ }));
    fireEvent.change(await screen.findByLabelText(/Transition text/), { target: { value: 'New **cue**' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done' }));
    await waitFor(async () => {
      const tree = (await loadTree(store, setlist.id))!;
      expect(tree.items.some((i) => i.transitionText === 'New **cue**')).toBe(true);
    });
    // one undo restores the old text
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    await waitFor(async () => {
      const tree = (await loadTree(store, setlist.id))!;
      expect(tree.items.some((i) => i.transitionText === 'New **cue**')).toBe(false);
    });
  });

  it('sets the tuning of a song for this setlist with the same string picker, and drops it when it matches the song again', async () => {
    const { store, setlist } = await setup('/setlist/:id');
    await screen.findByRole('heading', { name: 'Scaletta live' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(await screen.findByRole('button', { name: /Get Back/ }));
    await choose('String 6', 'D');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done' }));
    const song = (await store.songs.listBy('bandId', setlist.bandId)).find((x) => x.title === 'Get Back')!;
    await waitFor(async () => {
      const item = (await loadTree(store, setlist.id))!.items.find((i) => i.songId === song.id)!;
      expect((await store.tunings.get(item.tuningOverrideId!))?.notes).toBe('D A D G B E');
    });
    fireEvent.click(await screen.findByRole('button', { name: /Get Back/ }));
    await choose('String 6', 'E');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done' }));
    await waitFor(async () => {
      const item = (await loadTree(store, setlist.id))!.items.find((i) => i.songId === song.id)!;
      expect(item.tuningOverrideId).toBeUndefined();
    });
  });

  it('adds a library song and a brand new song to a block', async () => {
    const { store, band, setlist } = await setup('/setlist/:id');
    await screen.findByRole('heading', { name: 'Scaletta live' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click((await screen.findAllByRole('button', { name: '+ Add song' }))[0]!);
    const dialog = await screen.findByRole('dialog');

    const song = () => within(dialog).getByRole('switch', { name: /Zombie/ });
    fireEvent.click(song());
    await waitFor(async () => expect((await loadTree(store, setlist.id))!.items).toHaveLength(23));
    expect(song().getAttribute('aria-checked')).toBe('true');
    // a second tap takes it out again instead of adding a duplicate
    fireEvent.click(song());
    await waitFor(async () => expect((await loadTree(store, setlist.id))!.items).toHaveLength(22));
    fireEvent.click(song());
    await waitFor(async () => expect((await loadTree(store, setlist.id))!.items).toHaveLength(23));

    fireEvent.click(within(dialog).getByRole('button', { name: /New song/ }));
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Black Hole Sun' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create and add' }));
    await waitFor(async () => expect((await loadTree(store, setlist.id))!.items).toHaveLength(24));
    expect((await store.songs.listBy('bandId', band.id)).some((s) => s.title === 'Black Hole Sun')).toBe(true);
  });

  it('removes a block together with its songs, after confirmation', async () => {
    const { store, setlist } = await setup('/setlist/:id');
    await screen.findByRole('heading', { name: 'Scaletta live' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click((await screen.findAllByRole('button', { name: /Remove block/ }))[0]!);
    expect(confirm).toHaveBeenCalled();
    await waitFor(async () => {
      const tree = (await loadTree(store, setlist.id))!;
      expect(tree.blocks).toHaveLength(4);
      expect(tree.items).toHaveLength(18);
    });
  });
});
