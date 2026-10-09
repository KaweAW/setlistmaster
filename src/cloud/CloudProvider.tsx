import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Band } from '../core/types';
import { createLocalBand, removeLocalBand } from '../data/bands';
import { useData } from '../data/DataProvider';
import { useDataRevision } from '../state/dataRevision';
import { useUiStore } from '../state/uiStore';
import { SyncEngine, type BandSyncStatus } from '../sync/engine';
import { cloudConfigured } from './config';
import { createSupabaseApi } from './supabaseApi';
import type { CloudApi, CloudNotice, CloudRole, CloudUser } from './types';

export interface CloudValue {
  /** The project has Supabase settings. Without them everything below is inert and the app is purely local. */
  configured: boolean;
  api: CloudApi | null;
  /** `undefined` while we still ask, `null` when signed out. */
  user: CloudUser | null | undefined;
  /** Bands of this device that sync, and the role the signed-in person has in each. */
  linked: ReadonlySet<string>;
  roles: Readonly<Record<string, CloudRole | null>>;
  statuses: Readonly<Record<string, BandSyncStatus>>;
  /** Puts a local band in the cloud (the person becomes its creator) and uploads its content. */
  share(band: Band): Promise<void>;
  /** Accepts an invitation and starts syncing that band here. Returns its id. */
  join(token: string): Promise<string>;
  /** Stops syncing; the data stays on this device as a normal local band. */
  unlink(bandId: string): Promise<void>;
  syncNow(bandId?: string): Promise<void>;
  refreshRole(bandId: string): Promise<void>;
  /** A new band on this device, shared at once (the person is its creator). */
  createBand(name: string): Promise<Band>;
  /** Name and notes; for a shared band only its creator can change them (the cloud is told too). */
  saveBand(bandId: string, patch: { name: string; notes: string }): Promise<void>;
  /** Creator only. Deletes the band for everyone and tells the other members; returns how many. `keepCopy` leaves a personal copy on this device. */
  deleteBand(bandId: string, options: { keepCopy: boolean }): Promise<number>;
  /** Things the cloud told this person while they were away (a band they were in was deleted). */
  notices: readonly CloudNotice[];
  dismissNotice(id: string): Promise<void>;
}

const inert: CloudValue = {
  configured: false, api: null, user: null, linked: new Set(), roles: {}, statuses: {},
  share: () => Promise.reject(new Error('cloud not configured')),
  join: () => Promise.reject(new Error('cloud not configured')),
  unlink: () => Promise.resolve(),
  syncNow: () => Promise.resolve(),
  refreshRole: () => Promise.resolve(),
  createBand: () => Promise.reject(new Error('cloud not configured')),
  saveBand: () => Promise.reject(new Error('cloud not configured')),
  deleteBand: () => Promise.reject(new Error('cloud not configured')),
  notices: [],
  dismissNotice: () => Promise.resolve(),
};

const CloudContext = createContext<CloudValue>(inert);
export const useCloud = (): CloudValue => useContext(CloudContext);

/** Can the person change data in this band? Local bands and creators/editors can; viewers only read. */
export function useCanEdit(bandId: string): boolean {
  const { linked, roles } = useCloud();
  return !(linked.has(bandId) && roles[bandId] === 'viewer');
}

/**
 * The instrument I play in the open band. On a synced band and signed in it lives on my membership (so it follows me
 * to every device); otherwise, and as an offline copy, on this device. Local choices made while offline reach the
 * account the next time the band opens.
 */
export function useMyInstrument(): { id: string | null; set: (id: string | null) => Promise<void> } {
  const { api, user, linked } = useCloud();
  const { band } = useData();
  const local = useUiStore((s) => s.myInstruments[band.id] ?? null);
  const setLocal = useUiStore((s) => s.setMyInstrument);
  const synced = !!api && !!user && linked.has(band.id);
  useEffect(() => {
    if (!api || !synced) return;
    let alive = true;
    void api
      .myInstrument(band.id)
      .then((remote) => {
        if (!alive) return;
        if (remote) setLocal(band.id, remote);
        else if (useUiStore.getState().myInstruments[band.id]) void api.setMyInstrument(band.id, useUiStore.getState().myInstruments[band.id]!).catch(() => {});
      })
      .catch(() => {}); // offline: the local copy stands
    return () => {
      alive = false;
    };
  }, [api, synced, band.id, setLocal]);
  const set = useCallback(
    async (id: string | null) => {
      setLocal(band.id, id);
      if (api && synced) await api.setMyInstrument(band.id, id).catch(() => {});
    },
    [api, synced, band.id, setLocal],
  );
  return { id: local, set };
}

const PUSH_DELAY_MS = 800;

/**
 * Owns the sync engine: signs the person in, keeps every linked band up to date (on start, on every local change,
 * when the connection comes back, when the app returns to the foreground, and live while it is open).
 */
export function CloudProvider({ api: injected, children }: { api?: CloudApi | null; children: ReactNode }) {
  const { store } = useData();
  const api = useMemo(() => injected ?? (cloudConfigured ? createSupabaseApi() : null), [injected]);
  const [user, setUser] = useState<CloudUser | null | undefined>(api ? undefined : null);
  const [linked, setLinked] = useState<ReadonlySet<string>>(new Set());
  const [roles, setRoles] = useState<Record<string, CloudRole | null>>({});
  const [statuses, setStatuses] = useState<Record<string, BandSyncStatus>>({});
  const [notices, setNotices] = useState<readonly CloudNotice[]>([]);
  // The engine asks for the roles when it runs, not when it is built: keep the latest in a box it can read.
  const [roleMap] = useState(() => new Map<string, CloudRole | null>());
  useEffect(() => {
    roleMap.clear();
    Object.entries(roles).forEach(([id, role]) => roleMap.set(id, role));
  }, [roles, roleMap]);
  const bump = useDataRevision((s) => s.bump);
  const flash = useDataRevision((s) => s.flash);
  useEffect(() => store.sync.onRemoteApplied(flash), [store, flash]);

  // A sync round can still be running when the provider goes away (a test ending, a hot reload): it must not touch the UI then.
  const [live] = useState(() => new Set<string>());
  useEffect(() => {
    live.add('mounted');
    return () => { live.delete('mounted'); };
  }, [live]);

  const engine = useMemo(
    () =>
      api
        ? new SyncEngine(store.sync, api.remote, {
            onApplied: () => { if (live.has('mounted')) bump(); },
            onStatus: (bandId, status) => { if (live.has('mounted')) setStatuses((s) => ({ ...s, [bandId]: status })); },
            canWrite: (bandId) => roleMap.get(bandId) !== 'viewer',
          })
        : null,
    [api, store, bump, roleMap, live],
  );

  const reloadLinked = useCallback(async () => setLinked(new Set(await store.sync.linkedBands())), [store]);
  useEffect(() => {
    let alive = true;
    void store.sync.linkedBands().then((ids) => alive && setLinked(new Set(ids)));
    return () => {
      alive = false;
    };
  }, [store]);

  useEffect(() => {
    if (!api) return;
    let alive = true;
    void api.currentUser().then((u) => alive && setUser(u)).catch(() => alive && setUser(null));
    const stop = api.onAuthChange((u) => alive && setUser(u));
    return () => {
      alive = false;
      stop();
    };
  }, [api]);

  const refreshRole = useCallback(
    async (bandId: string) => {
      if (!api) return;
      try {
        const role = await api.myRole(bandId);
        setRoles((r) => ({ ...r, [bandId]: role }));
      } catch {
        /* offline: keep what we knew */
      }
    },
    [api],
  );

  // Signed in: learn our roles, start listening, catch up.
  const signedIn = user ? user.id : null;
  useEffect(() => {
    if (!api || !engine || !signedIn) return;
    const ids = [...linked];
    ids.forEach((id) => {
      void refreshRole(id).then(() => engine.syncBand(id));
      engine.watch(id);
    });
    return () => ids.forEach((id) => engine.unwatch(id));
  }, [api, engine, signedIn, linked, refreshRole]);

  // Bands I belong to but this device does not hold yet (made on another device, or added to my account): bring them in.
  // And the other way round: a band this device still shares but my account no longer has (I deleted it, or left it, on
  // another device: the cloud tells the *other* members, not me) is let go here too: its copy is removed, unless it holds
  // changes that never reached the cloud, in which case it stays as a local band so nothing is lost.
  // A band of my account that this device holds as a plain local copy is shared again.
  // Checked on start and whenever the app comes back to the foreground.
  useEffect(() => {
    if (!api || !signedIn) return;
    let alive = true;
    const load = async () => {
      try {
        const mine = await api.myBands();
        let added = false;
        for (const b of mine) {
          if (!(await store.bands.has(b.id))) {
            await store.bands.create({ id: b.id, name: b.name, notes: b.notes });
            await store.sync.linkBand(b.id); // reading only: nothing of ours goes up
            added = true;
          } else {
            const local = await store.bands.get(b.id);
            // The creator may have renamed the band or changed its notes elsewhere.
            if (local && (local.name !== b.name || (local.notes ?? '') !== b.notes)) await store.bands.update(b.id, { name: b.name, notes: b.notes });
            if (!(await store.sync.linkedBands()).includes(b.id)) {
              await store.sync.linkBand(b.id); // a copy kept from before: it follows the cloud again
              added = true;
            }
          }
          if (alive) setRoles((r) => ({ ...r, [b.id]: b.role }));
        }
        const inCloud = new Set(mine.map((b) => b.id));
        for (const id of await store.sync.linkedBands()) {
          if (inCloud.has(id)) continue;
          engine?.unwatch(id);
          const unsent = await store.sync.pendingCount(id);
          await store.sync.unlinkBand(id);
          if (unsent === 0) {
            await removeLocalBand(store, id);
            if (useUiStore.getState().activeBandId === id) useUiStore.getState().setActiveBandId(null);
          }
          added = true;
        }
        if (alive && added) await reloadLinked();
      } catch {
        /* offline or not allowed: nothing to add */
      }
    };
    void load();
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [api, engine, signedIn, store, reloadLinked]);

  // What the cloud told us while we were away: a band we were in was deleted. Its data stays here, as a local copy.
  useEffect(() => {
    if (!api || !signedIn) return;
    let alive = true;
    const load = async () => {
      try {
        const list = await api.notices();
        if (!alive) return;
        setNotices(list);
        let changed = false;
        for (const n of list) {
          if (n.kind === 'band_deleted' && (await store.sync.linkedBands()).includes(n.bandId)) {
            engine?.unwatch(n.bandId);
            await store.sync.unlinkBand(n.bandId);
            changed = true;
          }
        }
        if (changed && alive) await reloadLinked();
      } catch {
        /* offline, or a project without the notices table yet */
      }
    };
    void load();
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [api, engine, signedIn, store, reloadLinked]);

  // Local edits go out shortly after (several edits in a row travel together).
  useEffect(() => {
    if (!engine || !signedIn) return;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const stop = store.sync.onLocalChange((bandId) => {
      clearTimeout(timers.get(bandId));
      timers.set(bandId, setTimeout(() => void engine.syncBand(bandId), PUSH_DELAY_MS));
    });
    return () => {
      stop();
      timers.forEach(clearTimeout);
    };
  }, [engine, store, signedIn]);

  // Connection back, or app back in front: catch up.
  useEffect(() => {
    if (!engine || !signedIn) return;
    const catchUp = () => void engine.syncAll();
    const onVisible = () => document.visibilityState === 'visible' && catchUp();
    window.addEventListener('online', catchUp);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', catchUp);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [engine, signedIn]);

  useEffect(() => () => engine?.stop(), [engine]);

  const value = useMemo<CloudValue>(() => {
    if (!api || !engine) return inert;
    return {
      configured: true,
      api,
      user,
      linked,
      roles,
      statuses,
      async share(band) {
        await api.createBand(band.id, band.name);
        await store.sync.linkBand(band.id, { upload: true });
        setRoles((r) => ({ ...r, [band.id]: 'creator' }));
        await reloadLinked();
        await engine.syncBand(band.id);
      },
      async join(token) {
        const bandId = await api.acceptInvitation(token);
        if (!(await store.bands.has(bandId))) {
          const name = (await api.bandName(bandId)) ?? 'Band';
          await store.bands.create({ id: bandId, name });
        }
        await store.sync.linkBand(bandId); // joining only reads: nothing of ours is uploaded
        await refreshRole(bandId);
        await reloadLinked();
        useUiStore.getState().setActiveBandId(bandId);
        await engine.syncBand(bandId);
        return bandId;
      },
      async unlink(bandId) {
        engine.unwatch(bandId);
        await store.sync.unlinkBand(bandId);
        setStatuses((s) => {
          const rest = { ...s };
          delete rest[bandId];
          return rest;
        });
        await reloadLinked();
      },
      async syncNow(bandId) {
        if (bandId) await engine.syncBand(bandId);
        else await engine.syncAll();
      },
      refreshRole,
      async createBand(name) {
        const band = await createLocalBand(store, name, useUiStore.getState().language);
        await api.createBand(band.id, band.name);
        await store.sync.linkBand(band.id, { upload: true });
        setRoles((r) => ({ ...r, [band.id]: 'creator' }));
        await reloadLinked();
        await engine.syncBand(band.id);
        return band;
      },
      async saveBand(bandId, patch) {
        const name = patch.name.trim();
        if (!name) throw new Error('invalid_name');
        if ((await store.sync.linkedBands()).includes(bandId)) await api.updateBand(bandId, name, patch.notes);
        await store.bands.update(bandId, { name, notes: patch.notes });
      },
      async deleteBand(bandId, { keepCopy }) {
        const attachments = await store.attachments.listBy('bandId', bandId);
        for (const a of attachments) await api.remote.removeBlob(bandId, a.id).catch(() => {}); // the files first: the band row takes the permission with it
        const told = await api.deleteBand(bandId);
        engine.unwatch(bandId);
        await store.sync.unlinkBand(bandId);
        setStatuses((s) => { const rest = { ...s }; delete rest[bandId]; return rest; });
        setRoles((r) => { const rest = { ...r }; delete rest[bandId]; return rest; });
        const band = await store.bands.get(bandId);
        if (keepCopy && band) {
          const suffix = useUiStore.getState().language === 'it' ? 'copia' : 'copy';
          await store.bands.update(bandId, { name: `${band.name} (${suffix})` });
        } else await removeLocalBand(store, bandId);
        if (useUiStore.getState().activeBandId === bandId) useUiStore.getState().setActiveBandId(null);
        await reloadLinked();
        return told;
      },
      notices,
      async dismissNotice(id) {
        await api.dismissNotice(id);
        setNotices((list) => list.filter((n) => n.id !== id));
      },
    };
  }, [api, engine, user, linked, roles, statuses, notices, store, reloadLinked, refreshRole]);

  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>;
}
