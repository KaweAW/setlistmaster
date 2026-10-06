import { create } from 'zustand';

/** Bumped when changes from the cloud were written locally, so every open screen reloads its data. */
export const useDataRevision = create<{ revision: number; bump: () => void }>((set) => ({
  revision: 0,
  bump: () => set((s) => ({ revision: s.revision + 1 })),
}));
