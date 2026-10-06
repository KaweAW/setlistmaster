import { createDexieStore } from './dexie/dexieRepository';
import type { DataStore } from './repository';

/** App-wide store instance. Swap the implementation here (phase 6). */
export const store: DataStore = createDexieStore();
export type { DataStore, Repository } from './repository';
export { bootstrap } from './bootstrap';
