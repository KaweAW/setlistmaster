// @vitest-environment jsdom
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
    mount('/settings', server.as(null));
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  it('shares the band, then lets the creator invite by link and see the member list', async () => {
    const server = new FakeCloudServer();
    const store = mount('/settings', server.as(KAWE));
    fireEvent.click(await screen.findByRole('button', { name: 'Share this band' }));
    expect(await screen.findByText(/Your role: creator/)).toBeTruthy();
    const band = (await store.bands.listAll())[0]!;
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
    mount('/settings', alex, store);
    expect(await screen.findByText(/Your role: editor/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Create invitation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });
});

describe('the instrument I play', () => {
  it('is kept on my account, and a new device learns it', async () => {
    const server = new FakeCloudServer();
    const store = mount('/settings', server.as(KAWE));
    fireEvent.click(await screen.findByRole('button', { name: 'Share this band' }));
    await screen.findByText(/Your role: creator/);
    const band = (await store.bands.listAll())[0]!;
    const bass = (await store.instruments.listBy('bandId', band.id)).find((i) => i.name === 'Bass')!;
    fireEvent.change(await screen.findByLabelText('The instrument I play'), { target: { value: bass.id } });
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
  it('hides the buttons that change things, and sends nothing to the server', async () => {
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
    mount('/', alex, store);
    expect(await screen.findByText('Read only')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New setlist' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^More/ })).toBeNull();
    expect(server.remote.pushes).toBe(0);
  });
});
