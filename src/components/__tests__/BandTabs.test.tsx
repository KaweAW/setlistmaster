// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from '../../routes';
import { bootstrap } from '../../data/bootstrap';
import { createDexieStore } from '../../data/dexie/dexieRepository';
import { DataProvider } from '../../data/DataProvider';
import { useUiStore } from '../../state/uiStore';
import { CloudProvider } from '../../cloud/CloudProvider';
import { FakeCloudServer } from '../../cloud/__tests__/fakeCloud';

// Switching band reopens the store and reloads the page: on a slow CI machine that takes longer than the 1 s default.
configure({ asyncUtilTimeout: 10_000 });
vi.setConfig({ testTimeout: 30_000 });

vi.mock('../PdfViewer', () => ({ default: () => null }));

let n = 0;
const KAWE = { id: 'u-kawe@x.it', email: 'kawe@x.it' };

async function mount(shared: string[]) {
  const store = createDexieStore({ dbName: `tabs-${++n}` });
  await bootstrap(store, 'Mine', null, 'en');
  for (const name of shared) {
    const b = await store.bands.create({ name });
    await store.sync.linkBand(b.id);
    await new Promise((r) => setTimeout(r, 5)); // distinct creation times: the first shared band (the one the tab shows) is then always the first listed
  }
  const server = new FakeCloudServer();
  render(
    <MemoryRouter initialEntries={['/']}>
      <DataProvider store={store}>
        <CloudProvider api={server.as(KAWE)}>
          <AppRoutes />
        </CloudProvider>
      </DataProvider>
    </MemoryRouter>,
  );
  return store;
}

const swipe = (el: Element, dx: number) => {
  fireEvent.touchStart(el, { touches: [{ clientX: 300, clientY: 100 }] });
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: 300 + dx, clientY: 100 }] });
};

beforeEach(() => {
  window.scrollTo = vi.fn();
  useUiStore.setState({ language: 'en', stageMode: false, activeBandId: null, myInstruments: {} });
});
afterEach(cleanup);

describe('home band tabs', () => {
  it('shows Personal and the shared band, and switches by tap', async () => {
    await mount(['Wolves']);
    const personal = await screen.findByRole('tab', { name: /Personal/ });
    const wolves = screen.getByRole('tab', { name: /Wolves/ });
    expect(personal.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(wolves);
    await waitFor(() => expect(screen.getByRole('tab', { name: /Wolves/ }).getAttribute('aria-selected')).toBe('true'));
    fireEvent.click(screen.getByRole('tab', { name: /Personal/ }));
    await waitFor(() => expect(screen.getByRole('tab', { name: /Personal/ }).getAttribute('aria-selected')).toBe('true'));
  });

  it('swipes towards the Band tab and back; with several shared bands a second swipe opens the menu', async () => {
    await mount(['Wolves', 'Owls']);
    await screen.findByRole('tab', { name: /Personal/ });
    // The shared bands arrive from the (fake) cloud a moment after the first paint; a swipe before that has nowhere to go.
    await screen.findByRole('tab', { name: /Wolves/ });
    const main = document.querySelector('main')!;

    swipe(main, -120); // finger moves left: to the shared band
    await waitFor(() => expect(screen.getByRole('tab', { name: /Wolves/ }).getAttribute('aria-selected')).toBe('true'), { timeout: 8000 });

    swipe(document.querySelector('main')!, -120); // once more: the menu of bands
    const owls = await screen.findByRole('menuitemradio', { name: /Owls/ }, { timeout: 8000 });
    fireEvent.click(owls);
    await waitFor(() => expect(screen.getByRole('tab', { name: /Owls/ }).getAttribute('aria-selected')).toBe('true'), { timeout: 8000 });
    expect(screen.queryByRole('menu')).toBeNull();

    swipe(document.querySelector('main')!, 120); // back to Personal
    await waitFor(() => expect(screen.getByRole('tab', { name: /Personal/ }).getAttribute('aria-selected')).toBe('true'), { timeout: 8000 });
  }, 30_000);

  it('does not show the tabs on a device that cannot share', async () => {
    const store = createDexieStore({ dbName: `tabs-${++n}` });
    await bootstrap(store, 'Mine', null, 'en');
    render(
      <MemoryRouter initialEntries={['/']}>
        <DataProvider store={store}><CloudProvider api={null}><AppRoutes /></CloudProvider></DataProvider>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Setlists' });
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});

describe('bands of my account', () => {
  it('brings in the bands I belong to in the cloud, and keeps a personal space when the first band is shared', async () => {
    const server = new FakeCloudServer();
    const creator = server.as({ id: 'u-other', email: 'o@x.it' });
    await creator.createBand('cloud-1', 'Wolves');
    const inv = await creator.createInvitation('cloud-1', 'editor', KAWE.email);
    const me = server.as(KAWE);
    await me.acceptInvitation(inv); // a membership made elsewhere: this device does not know the band yet

    const store = createDexieStore({ dbName: `tabs-${++n}` });
    const own = await bootstrap(store, 'Mine', null, 'en');
    await store.sync.linkBand(own.id); // the device's own band is already shared
    render(
      <MemoryRouter initialEntries={['/']}>
        <DataProvider store={store}><CloudProvider api={me}><AppRoutes /></CloudProvider></DataProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('tab', { name: /Personal/ })).toBeTruthy());
    expect((await store.bands.listAll()).map((b) => b.name).sort()).toEqual(['Mine', 'Personal', 'Wolves']);
    expect(await store.sync.linkedBands()).toContain('cloud-1');
  });
});
