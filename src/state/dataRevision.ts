import { create } from 'zustand';

interface RevisionState {
  revision: number;
  /** When each record last changed because of a bandmate (id → time), so the screen can highlight it for a moment. */
  flashed: Readonly<Record<string, number>>;
  /** Bumped when changes from the cloud were written locally, so every open screen reloads its data. */
  bump: () => void;
  flash: (ids: string[]) => void;
}

const FLASH_KEEP_MS = 4000;

export const useDataRevision = create<RevisionState>((set, get) => ({
  revision: 0,
  flashed: {},
  bump: () => set((s) => ({ revision: s.revision + 1 })),
  flash: (ids) => {
    if (ids.length === 0) return;
    // Forget the highlight once it has played, so a screen opened later does not replay it.
    setTimeout(() => {
      const now = Date.now();
      const left = Object.fromEntries(Object.entries(get().flashed).filter(([, at]) => now - at < FLASH_KEEP_MS));
      set({ flashed: left });
    }, FLASH_KEEP_MS + 50);
    set((s) => {
      const now = Date.now();
      const kept = Object.fromEntries(Object.entries(s.flashed).filter(([, at]) => now - at < FLASH_KEEP_MS));
      for (const id of ids) kept[id] = now;
      return { flashed: kept };
    });
  },
}));


export { FLASH_KEEP_MS };
