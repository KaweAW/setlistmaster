import type { OutboxEntry, SyncRecord } from '../core/sync';
import type {
  Band,
  BaseEntity,
  Block,
  Member,
  Performer,
  Setlist,
  SetlistItem,
  Song,
  StoredFile,
  StoreSnapshot,
  Tuning,
} from '../core/types';

/** Input for create(): id is optional (generated when missing), bookkeeping fields are set by the repository. */
export type NewEntity<T extends BaseEntity> = Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> & {
  id?: string;
};

/**
 * The only door to persistent data. UI code depends on these interfaces, never on Dexie,
 * so phase 6 can swap the implementation (local + Supabase sync) without touching pages.
 * Soft-deleted records are never returned.
 */
export interface Repository<T extends BaseEntity> {
  get(id: string): Promise<T | undefined>;
  /** True if a record with this id exists, even if it was (soft) deleted. */
  has(id: string): Promise<boolean>;
  listAll(): Promise<T[]>;
  listBy<K extends keyof T & string>(field: K, value: T[K]): Promise<T[]>;
  create(input: NewEntity<T>): Promise<T>;
  /**
   * Writes a complete record as it is (validated, timestamps untouched, deletedAt included).
   * Used by undo/redo, duplication and, later, import and sync.
   */
  put(record: T): Promise<void>;
  update(id: string, patch: Partial<NewEntity<T>>): Promise<T>;
  /** Soft delete (sets deletedAt). */
  remove(id: string): Promise<void>;
}

/** Binary attachments (PDF charts). Kept apart from the entity repositories: hard delete, no validation. */
export interface FileRepository {
  get(id: string): Promise<StoredFile | undefined>;
  put(file: StoredFile): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Whole-database operations for backup, restore and "delete everything". */
export interface BulkStore {
  /** Every live record plus the PDFs (soft-deleted records are left out). */
  readAll(): Promise<StoreSnapshot>;
  /**
   * Replaces ALL data with the snapshot, atomically: the snapshot is validated first, and the swap runs in one
   * transaction, so a failure leaves the previous data untouched.
   */
  replaceAll(snapshot: StoreSnapshot): Promise<void>;
  /** Erases everything. */
  clearAll(): Promise<void>;
}

/** Cloud sync bookkeeping, kept next to the data it describes. The sync engine is the only user. */
export interface SyncStore {
  /** Starts syncing a band. `upload` queues everything it has (sharing a local band); otherwise it only reads (joining). */
  linkBand(bandId: string, options?: { upload?: boolean }): Promise<void>;
  /** Stops syncing a band. Its data stays on the device as an ordinary local band. */
  unlinkBand(bandId: string): Promise<void>;
  linkedBands(): Promise<string[]>;
  cursor(bandId: string): Promise<number>;
  setCursor(bandId: string, cursor: number): Promise<void>;
  pending(bandId: string, limit: number): Promise<OutboxEntry[]>;
  pendingCount(bandId: string): Promise<number>;
  /** The current content of the queued records (deleted ones included). */
  readRecords(entries: OutboxEntry[]): Promise<SyncRecord[]>;
  /** Drops sent entries, unless the record was edited again meanwhile. */
  ack(entries: OutboxEntry[]): Promise<void>;
  /** Writes changes that came from the cloud, last write wins. They are not queued to be sent back. Returns how many were applied. */
  applyRemote(records: SyncRecord[]): Promise<number>;
  /** Called after every local change to a synced band. */
  onLocalChange(listener: (bandId: string) => void): () => void;
}

export interface DataStore {
  bands: Repository<Band>;
  members: Repository<Member>;
  performers: Repository<Performer>;
  tunings: Repository<Tuning>;
  songs: Repository<Song>;
  setlists: Repository<Setlist>;
  blocks: Repository<Block>;
  items: Repository<SetlistItem>;
  files: FileRepository;
  bulk: BulkStore;
  sync: SyncStore;
}
