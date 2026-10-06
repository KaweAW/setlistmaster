import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Band } from '../core/types';
import { useData } from '../data/DataProvider';
import { useDataRevision } from '../state/dataRevision';
import { useUiStore } from '../state/uiStore';
import { SyncEngine, type BandSyncStatus } from '../sync/engine';
import { cloudConfigured } from './config';
import { createSupabaseApi } from './supabaseApi';
import type { CloudApi, CloudRole, CloudUser } from './types';

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
}

const inert: CloudValue = {
  configured: false, api: null, user: null, linked: new Set(), roles: {}, statuses: {},
  share: () => Promise.reject(new Error('cloud not configured')),
  join: () => Promise.reject(new Error('cloud not configured')),
  unlink: () => Promise.resolve(),
  syncNow: () => Promise.resolve(),
  refreshRole: () => Promise.resolve(),
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
  // The engine asks for the roles when it runs, not when it is built: keep the latest in a box it can read.
  const [roleMap] = useState(() => new Map<string, CloudRole | null>());
  useEffect(() => {
    roleMap.clear();
    Object.entries(roles).forEach(([id, role]) => roleMap.set(id, role));
  }, [roles, roleMap]);
  const bump = useDataRevision((s) => s.bump);

  const engine = useMemo(
    () =>
      api
        ? new SyncEngine(store.sync, api.remote, {
            onApplied: bump,
            onStatus: (bandId, status) => setStatuses((s) => ({ ...s, [bandId]: status })),
            canWrite: (bandId) => roleMap.get(bandId) !== 'viewer',
          })
        : null,
    [api, store, bump, roleMap],
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
    };
  }, [api, engine, user, linked, roles, statuses, store, reloadLinked, refreshRole]);

  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>;
}
