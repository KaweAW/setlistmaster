// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from '../../routes';
import { createDexieStore } from '../../data/dexie/dexieRepository';
import { bootstrap } from '../../data/bootstrap';
import { createLocalBand } from '../../data/bands';
import { DataProvider } from '../../data/DataProvider';
import { useUiStore } from '../../state/uiStore';

afterEach(cleanup);

describe('saving a new song', () => {
  it('works in a band that has no tunings yet (a band created or joined after the first one)', async () => {
    const store = createDexieStore({ dbName: 'song-save-1' });
    await bootstrap(store);
    const band = await createLocalBand(store, 'Beside', 'en');
    expect(await store.tunings.listBy('bandId', band.id)).toHaveLength(0);
    useUiStore.setState({ activeBandId: band.id });
    render(
      <MemoryRouter initialEntries={['/library/new']}>
        <DataProvider store={store}><AppRoutes /></DataProvider>
      </MemoryRouter>,
    );
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Waiting Room' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect((await store.songs.listBy('bandId', band.id)).map((s) => s.title)).toEqual(['Waiting Room']));
    expect(screen.queryByText(/Could not save/)).toBeNull();
    const [song] = await store.songs.listBy('bandId', band.id);
    const tuning = await store.tunings.get(song!.tuningId);
    expect(tuning?.isStandard).toBe(true);
  });
});
