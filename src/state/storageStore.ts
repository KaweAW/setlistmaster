import { create } from 'zustand';
import { ensurePersistentStorage, storageUsage, type Persistence, type StorageUsage } from '../lib/storagePersistence';

interface StorageState {
  persistence: Persistence | 'unknown';
  usage: StorageUsage | null;
  /** Asks for protected storage and refreshes the numbers. */
  check: () => Promise<void>;
}

export const useStorageStore = create<StorageState>()((set) => ({
  persistence: 'unknown',
  usage: null,
  check: async () => {
    const [persistence, usage] = await Promise.all([ensurePersistentStorage(), storageUsage()]);
    set({ persistence, usage });
  },
}));
