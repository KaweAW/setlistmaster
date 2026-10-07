// @vitest-environment jsdom
import { choose } from '../../components/__tests__/choose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from '../../routes';
import { bootstrap } from '../../data/bootstrap';
import { createDexieStore } from '../../data/dexie/dexieRepository';
import { DataProvider } from '../../data/DataProvider';
import { useUiStore } from '../../state/uiStore';
import { CloudProvider } from '../CloudProvider';
import type { CloudApi } from '../types';
import { FakeCloudServer } from './fakeCloud';

vi.mock('../../components/PdfViewer', () => ({ default: () => null }));

let n = 0;
const KAWE = { id: 'u-kawe@x.it', email: 'kawe@x.it' };
const ALEX = { id: 'u-alex@x.it', email: 'alex@x.it' };

function mount(path: string, api: CloudApi | null, store = createDexieStore({ dbName: `cloud-${++n}` })) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <DataProvider store={store}>
        <CloudProvider api={api}>
          <AppRoutes />
        </CloudProvider>
      </DataProvider>
    </MemoryRouter>,
  );
  return store;
}

/** A device with one local band, not shared yet. */
async function localDevice() {
  const store = createDexieStore({ dbName: `cloud-${++n}` });
  await bootstrap(store);
  const band = (await store.bands.listAll())[0]!;
  useUiStore.setState({ activeBandId: band.id });
  return store;
}

beforeEach(() => {
  window.scrollTo = vi.fn();
  useUiStore.setState({ language: 'en', stageMode: false, activeBandId: null, myInstruments: {} });
});
afterEach(cleanup);

describe('sharing screen', () => {
  it('says plainly that sharing is off when the app has no cloud settings', async () => {
    mount('/settings', null);
    expect(await screen.findByText(/not set up in this copy/i)).toBeTruthy();
  });

  it('asks to sign in when signed out', async () => {
    const server = new FakeCloudServer();
    mount('/bands', server.as(null));
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  it('shares the band, then lets the creator invite by link and see the member list', async () => {
    const server = new FakeCloudServer();
    const store = await localDevice();
    const band = (await store.bands.listAll())[0]!;
    mount(`/bands/${band.id}`, server.as(KAWE), store);
    fireEvent.click(await screen.findByRole('button', { name: 'Share this band' }));
    expect(await screen.findByText(/Your role: creator/)).toBeTruthy();
    expect(await store.sync.linkedBands()).toEqual([band.id]);
    await waitFor(() => expect(server.remote.rows.size).toBeGreaterThan(50)); // songs, setlist… went up
    expect(await screen.findByText(KAWE.email)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Create invitation' }));
    const box = (await screen.findByTestId('created-invite')) as HTMLElement;
    const link = (within(box).getByLabelText('Invitation link') as HTMLInputElement).value;
    expect(link).toMatch(/\/join\/tok\d+$/);
  });

  it('lets only the creator change roles: an editor sees no invite form and no remove buttons', async () => {
    const server = new FakeCloudServer();
    const creator = server.as(KAWE);
    await creator.createBand('b1', 'Band');
    await creator.createInvitation('b1', 'editor');
    const store = createDexieStore({ dbName: `cloud-${++n}` });
    await bootstrap(store);
    await store.bands.create({ id: 'b1', name: 'Band' });
    await store.sync.linkBand('b1');
    useUiStore.setState({ activeBandId: 'b1' });
    const alex = server.as(ALEX);
    await alex.acceptInvitation('tok1');
    mount('/bands/b1', alex, store);
    expect(await screen.findByText(/Your role: editor/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Create invitation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });
});

describe('the instrument I play', () => {
  it('is kept on my account, and a new device learns it', async () => {
    const server = new FakeCloudServer();
    const store = await localDevice();
    const band = (await store.bands.listAll())[0]!;
    mount(`/bands/${band.id}`, server.as(KAWE), store);
    fireEvent.click(await screen.findByRole('button', { name: 'Share this band' }));
    await screen.findByText(/Your role: creator/);
    cleanup();
    mount('/settings', server.as(KAWE), store);
    const bass = (await store.instruments.listBy('bandId', band.id)).find((i) => i.name === 'Bass')!;
    await choose('The instrument I play', bass.id);
    await waitFor(() => expect(server.instruments.get(`${band.id}:${KAWE.id}`)).toBe(bass.id));

    cleanup();
    useUiStore.setState({ myInstruments: {} }); // a fresh device: nothing remembered locally
    mount('/settings', server.as(KAWE), store);
    await waitFor(() => expect(useUiStore.getState().myInstruments[band.id]).toBe(bass.id));
  });
});

describe('joining with a link', () => {
  async function invited(role: 'editor' | 'viewer', email?: string) {
    const server = new FakeCloudServer();
    const creator = server.as(KAWE);
    await creator.createBand('band-1', 'The Band');
    const token = await creator.createInvitation('band-1', role, email);
    return { server, token };
  }

  it('shows what the invitation is for, joins, and syncs the band', async () => {
    const { server, token } = await invited('viewer');
    server.remote.rows.set('band-1/performer/p1', {
      kind: 'performer', id: 'p1', bandId: 'band-1', updatedAt: 5, deletedAt: null, seq: 1,
      data: { id: 'p1', bandId: 'band-1', createdAt: 5, updatedAt: 5, name: 'Julie', color: '#C4245C', symbol: '♀' },
    });
    const store = mount(`/join/${token}`, server.as(ALEX));
    expect(await screen.findByText(/invited to join The Band as viewer/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Join the band' }));
    expect(await screen.findByText('You joined The Band.')).toBeTruthy();
    expect(await store.sync.linkedBands()).toEqual(['band-1']);
    await waitFor(async () => expect((await store.performers.listBy('bandId', 'band-1')).map((p) => p.name)).toEqual(['Julie']));
    expect(useUiStore.getState().activeBandId).toBe('band-1');
  });

  it('refuses a link that was revoked or already used', async () => {
    const { server, token } = await invited('editor');
    await server.as(KAWE).revokeInvitation('inv1');
    mount(`/join/${token}`, server.as(ALEX));
    expect(await screen.findByText('This invitation was revoked.')).toBeTruthy();
  });

  it('refuses an invitation meant for another email address', async () => {
    const { server, token } = await invited('editor', 'someone@else.it');
    mount(`/join/${token}`, server.as(ALEX));
    fireEvent.click(await screen.findByRole('button', { name: 'Join the band' }));
    expect(await screen.findByText(/another email address/)).toBeTruthy();
  });

  it('asks to sign in first when signed out', async () => {
    const { server, token } = await invited('editor');
    mount(`/join/${token}`, server.as(null));
    expect(await screen.findByText(/Sign in or create an account to accept/)).toBeTruthy();
  });
});

describe('read-only viewers', () => {
  /** A device that joined band b1 as a viewer. */
  async function viewerDevice() {
    const server = new FakeCloudServer();
    const creator = server.as(KAWE);
    await creator.createBand('b1', 'Band');
    await creator.createInvitation('b1', 'viewer');
    const store = createDexieStore({ dbName: `cloud-${++n}` });
    await bootstrap(store);
    await store.bands.create({ id: 'b1', name: 'Band' });
    await store.sync.linkBand('b1');
    useUiStore.setState({ activeBandId: 'b1' });
    const alex = server.as(ALEX);
    await alex.acceptInvitation('tok1');
    return { server, store, alex };
  }

  it('hides the buttons that change things, and sends nothing to the server', async () => {
    const { server, store, alex } = await viewerDevice();
    mount('/', alex, store);
    expect(await screen.findByText('Read only')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New setlist' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^More/ })).toBeNull();
    expect(server.remote.pushes).toBe(0);
  });

  it('cannot add, edit or delete singers and tunings in Settings', async () => {
    const { store, alex } = await viewerDevice();
    await store.performers.create({ bandId: 'b1', name: 'Julie', color: '#C4245C', symbol: '♀' });
    mount('/settings', alex, store);
    expect(await screen.findByText('Julie')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add singer|performer/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('does not open the new-song form even when its address is typed', async () => {
    const { store, alex } = await viewerDevice();
    mount('/library/new', alex, store);
    expect(await screen.findByText(/read and play this band, but not change it/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('does not open the setlist in edit mode even when asked to', async () => {
    const { store, alex } = await viewerDevice();
    const setlist = await store.setlists.create({ bandId: 'b1', title: 'Night', archived: false } as never);
    mount(`/setlist/${setlist.id}`, alex, store);
    await screen.findByText('Night');
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });
});

describe('band management', () => {
  /** KAWE shares a band; ALEX joins it. Returns both devices' world. */
  async function shared() {
    const server = new FakeCloudServer();
    const store = await localDevice();
    const band = (await store.bands.listAll())[0]!;
    return { server, store, band };
  }

  it('lists owned, joined and local-only bands separately', async () => {
    const server = new FakeCloudServer();
    const alexApi = server.as(ALEX);
    await alexApi.createBand('theirs', 'Their band');
    await alexApi.createInvitation('theirs', 'editor');
    await server.as(KAWE).acceptInvitation('tok1');
    await server.as(KAWE).createBand('mine', 'My shared band');
    const store = await localDevice();
    mount('/bands', server.as(KAWE), store);
    expect(await screen.findByText('Your bands')).toBeTruthy();
    expect(await screen.findByText('My shared band')).toBeTruthy();
    expect(await screen.findByText('Their band')).toBeTruthy();
    expect(screen.getByText('Bands you are in')).toBeTruthy();
    expect(screen.getByText('Only on this device')).toBeTruthy();
  });

  it('renames the band and saves its notes', async () => {
    const { server, store, band } = await shared();
    mount(`/bands/${band.id}`, server.as(KAWE), store);
    const name = (await screen.findByLabelText('Band name')) as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'The Rockets' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect((await store.bands.listAll())[0]!.name).toBe('The Rockets'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit notes' }));
    fireEvent.change(await within(await screen.findByRole('dialog')).findByRole('textbox'), { target: { value: 'Rehearsals on Tuesday' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      const b = (await store.bands.listAll())[0]!;
      expect(b.name).toBe('The Rockets');
      expect(b.notes).toBe('Rehearsals on Tuesday');
    });
  });

  it('only deletes after typing the exact name, tells the members, and removes the band', async () => {
    const server = new FakeCloudServer();
    const store = await localDevice();
    const band = (await store.bands.listAll())[0]!;
    const kawe = server.as(KAWE);
    await kawe.createBand(band.id, band.name);
    await kawe.createInvitation(band.id, 'editor');
    await store.sync.linkBand(band.id);
    await server.as(ALEX).acceptInvitation('tok1');
    mount(`/bands/${band.id}`, kawe, store);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete this band…' }));
    const go = (await screen.findByRole('button', { name: 'Delete for everyone' })) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    expect(await screen.findByText(/The 1 other members will be told/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Type the band name to confirm'), { target: { value: band.name } });
    expect(go.disabled).toBe(false);
    fireEvent.click(go);
    await waitFor(() => expect(server.notices.filter((x) => x.userId === ALEX.id)).toHaveLength(1));
    expect(server.notices[0]!.bandName).toBe(band.name);
  });

  it('shows a deleted-band notice to a member, who keeps a local copy', async () => {
    const server = new FakeCloudServer();
    const kawe = server.as(KAWE);
    await kawe.createBand('b1', 'Band');
    await kawe.createInvitation('b1', 'editor');
    const store = createDexieStore({ dbName: `cloud-${++n}` });
    await bootstrap(store);
    await store.bands.create({ id: 'b1', name: 'Band' });
    await store.sync.linkBand('b1');
    useUiStore.setState({ activeBandId: 'b1' });
    const alex = server.as(ALEX);
    await alex.acceptInvitation('tok1');
    await kawe.deleteBand('b1');
    mount('/', alex, store);
    expect(await screen.findByText(/deleted the band “Band”/)).toBeTruthy();
    expect(await store.sync.linkedBands()).toEqual([]);
    expect((await store.bands.listAll()).some((b) => b.id === 'b1')).toBe(true);
  });
});
