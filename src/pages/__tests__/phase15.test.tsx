// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from '../../routes';
import { todayIso } from '../../core/countdown';
import { bootstrap } from '../../data/bootstrap';
import { createDexieStore } from '../../data/dexie/dexieRepository';
import { DataProvider } from '../../data/DataProvider';
import { createSetlist } from '../../data/setlistService';
import { useUiStore } from '../../state/uiStore';

vi.mock('../../components/PdfViewer', () => ({ default: () => null }));

let n = 0;
const inDays = (d: number) => {
  const x = new Date();
  x.setDate(x.getDate() + d);
  return todayIso(x);
};

async function home(withSetlist: (store: ReturnType<typeof createDexieStore>, bandId: string) => Promise<void>) {
  const store = createDexieStore({ dbName: `home-${++n}` });
  await bootstrap(store);
  const band = (await store.bands.listAll())[0]!;
  useUiStore.setState({ language: 'en', activeBandId: band.id });
  for (const s of await store.setlists.listBy('bandId', band.id)) await store.setlists.remove(s.id);
  await withSetlist(store, band.id);
  render(
    <MemoryRouter initialEntries={['/']}>
      <DataProvider store={store}><AppRoutes /></DataProvider>
    </MemoryRouter>,
  );
  return store;
}

beforeEach(() => {
  window.scrollTo = vi.fn();
});
afterEach(cleanup);

describe('the home', () => {
  it('shows an empty state with the same sentence as before', async () => {
    await home(async () => {});
    expect(await screen.findByText('No setlists yet. Create the first one.')).toBeTruthy();
  });

  it('highlights the next gig with its countdown, ignoring past and archived setlists', async () => {
    await home(async (store, bandId) => {
      const mk = async (title: string, date: string, archived = false) => {
        const s = await createSetlist(store, bandId, { title, firstBlock: 'Set' });
        await store.setlists.update(s.id, { date, archived });
      };
      await mk('Old one', inDays(-5));
      await mk('Archived soon', inDays(2), true);
      await mk('Far away', inDays(30));
      await mk('Coming up', inDays(9));
    });
    expect(await screen.findByText('Next gig')).toBeTruthy();
    const hero = screen.getByText('Next gig').closest('a')!;
    expect(hero.textContent).toContain('Coming up');
    expect(hero.textContent).toContain('9');
    expect(hero.textContent).toContain('days to go');
    expect(hero.getAttribute('href')).toMatch(/^\/setlist\//);
  });

  it('says "Today" on the day of the gig and has no hero without a date', async () => {
    await home(async (store, bandId) => {
      const s = await createSetlist(store, bandId, { title: 'Tonight', firstBlock: 'Set' });
      await store.setlists.update(s.id, { date: inDays(0) });
    });
    const hero = (await screen.findByText('Next gig')).closest('a')!;
    expect(hero.textContent).toContain('Today');
    cleanup();
    await home(async (store, bandId) => {
      await createSetlist(store, bandId, { title: 'No date', firstBlock: 'Set' });
    });
    await screen.findByText('No date');
    expect(screen.queryByText('Next gig')).toBeNull();
  });

  it('creates a setlist from the floating button', async () => {
    const store = await home(async () => {});
    fireEvent.click(await screen.findByRole('button', { name: 'New setlist' }));
    await vi.waitFor(async () => expect((await store.setlists.listAll()).length).toBe(1));
  });
});
