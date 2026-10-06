import { create } from 'zustand';

/** What the service worker tells the UI (filled in by main.tsx; not persisted). */
interface PwaState {
  /** A new version is installed and waiting; reloading applies it. */
  needRefresh: boolean;
  /** The app has been cached in full: it now works without a network. */
  offlineReady: boolean;
  applyUpdate: () => void;
  dismissOfflineReady: () => void;
}

export const usePwaStore = create<PwaState>()((set) => ({
  needRefresh: false,
  offlineReady: false,
  applyUpdate: () => {},
  dismissOfflineReady: () => set({ offlineReady: false }),
}));
