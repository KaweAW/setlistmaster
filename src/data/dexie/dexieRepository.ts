import type { EntityTable } from 'dexie';
import type { BaseEntity, StoredFile, StoreSnapshot } from '../../core/types';
import { newId } from '../../core/ids';
import * as s from '../../core/schemas';
import type { BulkStore, DataStore, FileRepository, NewEntity, Repository } from '../repository';
import type { SyncKind } from '../../core/sync';
import { ScalettaDb } from './db';
import { DexieSyncStore } from './dexieSync';

type Clock = () => number;

/** Anything with a Zod-like `parse` (keeps the repository independent of Zod's input/output generics). */
interface Parser<T> {
  parse(data: unknown): T;
}

class DexieRepository<T extends BaseEntity> implements Repository<T> {
  constructor(
    private readonly table: EntityTable<T, 'id'>,
    private readonly schema: Parser<T>,
    private readonly now: Clock,
    /** Queues each written record for the cloud (only for the kinds that sync). */
    private readonly track?: (record: T) => Promise<void>,
  ) {}

  private parse(record: unknown): T {
    return this.schema.parse(record);
  }

  async get(id: string): Promise<T | undefined> {
    const row = await this.table.get(id as never); // ids are always strings (BaseEntity); Dexie's generic key type can't see that
    return row && row.deletedAt === undefined ? this.parse(row) : undefined;
  }

  async has(id: string): Promise<boolean> {
    return (await this.table.get(id as never)) !== undefined;
  }

  async listAll(): Promise<T[]> {
    const rows = await this.table.toArray();
    return rows.filter((r) => r.deletedAt === undefined).map((r) => this.parse(r));
  }

  async listBy<K extends keyof T & string>(field: K, value: T[K]): Promise<T[]> {
    const rows = await this.table.where(field).equals(value as never).toArray();
    return rows.filter((r) => r.deletedAt === undefined).map((r) => this.parse(r));
  }

  async create(input: NewEntity<T>): Promise<T> {
    const t = this.now();
    const record = this.parse({ ...input, id: input.id ?? newId(), createdAt: t, updatedAt: t });
    await this.table.add(record);
    await this.track?.(record);
    return record;
  }

  async put(record: T): Promise<void> {
    const valid = this.parse(record);
    await this.table.put(valid);
    await this.track?.(valid);
  }

  async update(id: string, patch: Partial<NewEntity<T>>): Promise<T> {
    const current = await this.get(id);
    if (!current) throw new Error(`Record not found: ${id}`);
    // id and createdAt are immutable; updatedAt is always refreshed.
    const record = this.parse({
      ...current,
      ...patch,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: this.now(),
    });
    await this.table.put(record);
    await this.track?.(record);
    return record;
  }

  async remove(id: string): Promise<void> {
    const current = await this.get(id);
    if (!current) return;
    const t = this.now();
    const removed = { ...current, deletedAt: t, updatedAt: t };
    await this.table.put(removed);
    await this.track?.(removed);
  }
}

class DexieFileRepository implements FileRepository {
  constructor(private readonly table: EntityTable<StoredFile, 'id'>) {}
  get(id: string): Promise<StoredFile | undefined> {
    return this.table.get(id);
  }
  async present(ids: string[]): Promise<Set<string>> {
    const keys = await this.table.where('id').anyOf(ids).primaryKeys();
    return new Set(keys as string[]);
  }
  async put(file: StoredFile): Promise<void> {
    await this.table.put(file);
  }
  async remove(id: string): Promise<void> {
    await this.table.delete(id);
  }
}

class DexieBulkStore implements BulkStore {
  constructor(
    private readonly db: ScalettaDb,
    private readonly sync: DexieSyncStore,
  ) {}

  /** The tables were swapped wholesale (restore, wipe): the cloud links went with them, so forget the cached ones. */
  private afterReplace(): Promise<void> {
    return this.sync.forgetAll();
  }

  async readAll(): Promise<StoreSnapshot> {
    const live = async <T extends BaseEntity>(table: EntityTable<T, 'id'>, schema: Parser<T>) =>
      (await table.toArray()).filter((r) => r.deletedAt === undefined).map((r) => schema.parse(r));
    const { db } = this;
    return db.transaction('r', db.tables, async () => ({
      bands: await live(db.bands, s.bandSchema),
      members: await live(db.members, s.memberSchema),
      performers: await live(db.performers, s.performerSchema),
      tunings: await live(db.tunings, s.tuningSchema),
      instruments: await live(db.instruments, s.instrumentSchema),
      parts: await live(db.parts, s.partSchema),
      attachments: await live(db.attachments, s.attachmentSchema),
      songs: await live(db.songs, s.songSchema),
      setlists: await live(db.setlists, s.setlistSchema),
      blocks: await live(db.blocks, s.blockSchema),
      items: await live(db.items, s.setlistItemSchema),
      files: await db.files.toArray(),
    }));
  }

  async replaceAll(snapshot: StoreSnapshot): Promise<void> {
    // Validate everything BEFORE touching the database, so bad input can never leave it half-erased.
    const valid: StoreSnapshot = {
      bands: snapshot.bands.map((r) => s.bandSchema.parse(r)),
      members: snapshot.members.map((r) => s.memberSchema.parse(r)),
      performers: snapshot.performers.map((r) => s.performerSchema.parse(r)),
      tunings: snapshot.tunings.map((r) => s.tuningSchema.parse(r)),
      instruments: snapshot.instruments.map((r) => s.instrumentSchema.parse(r)),
      parts: snapshot.parts.map((r) => s.partSchema.parse(r)),
      attachments: snapshot.attachments.map((r) => s.attachmentSchema.parse(r)),
      songs: snapshot.songs.map((r) => s.songSchema.parse(r)),
      setlists: snapshot.setlists.map((r) => s.setlistSchema.parse(r)),
      blocks: snapshot.blocks.map((r) => s.blockSchema.parse(r)),
      items: snapshot.items.map((r) => s.setlistItemSchema.parse(r)),
      files: snapshot.files,
    };
    if (valid.bands.length === 0) throw new Error('A snapshot needs at least one band');
    const { db } = this;
    await db.transaction('rw', db.tables, async () => {
      await Promise.all(db.tables.map((table) => table.clear()));
      await db.bands.bulkPut(valid.bands);
      await db.members.bulkPut(valid.members);
      await db.performers.bulkPut(valid.performers);
      await db.tunings.bulkPut(valid.tunings);
      await db.instruments.bulkPut(valid.instruments);
      await db.parts.bulkPut(valid.parts);
      await db.attachments.bulkPut(valid.attachments);
      await db.songs.bulkPut(valid.songs);
      await db.setlists.bulkPut(valid.setlists);
      await db.blocks.bulkPut(valid.blocks);
      await db.items.bulkPut(valid.items);
      await db.files.bulkPut(valid.files);
    });
    await this.afterReplace();
  }

  async clearAll(): Promise<void> {
    const { db } = this;
    await db.transaction('rw', db.tables, () => Promise.all(db.tables.map((table) => table.clear())));
    await this.afterReplace();
  }
}

export interface DexieStoreOptions {
  /** IndexedDB database name (tests use a unique one per case). */
  dbName?: string;
  now?: Clock;
}

export function createDexieStore(options: DexieStoreOptions = {}): DataStore & { db: ScalettaDb } {
  const db = new ScalettaDb(options.dbName);
  const now = options.now ?? Date.now;
  const sync = new DexieSyncStore(db);
  const track = <T extends BaseEntity & { bandId: string }>(kind: SyncKind) => (record: T) => sync.record(kind, record);
  return {
    db,
    bands: new DexieRepository(db.bands, s.bandSchema, now),
    members: new DexieRepository(db.members, s.memberSchema, now),
    performers: new DexieRepository(db.performers, s.performerSchema, now, track('performer')),
    tunings: new DexieRepository(db.tunings, s.tuningSchema, now, track('tuning')),
    instruments: new DexieRepository(db.instruments, s.instrumentSchema, now, track('instrument')),
    parts: new DexieRepository(db.parts, s.partSchema, now, track('part')),
    attachments: new DexieRepository(db.attachments, s.attachmentSchema, now, track('attachment')),
    songs: new DexieRepository(db.songs, s.songSchema, now, track('song')),
    setlists: new DexieRepository(db.setlists, s.setlistSchema, now, track('setlist')),
    blocks: new DexieRepository(db.blocks, s.blockSchema, now, track('block')),
    items: new DexieRepository(db.items, s.setlistItemSchema, now, track('item')),
    files: new DexieFileRepository(db.files),
    bulk: new DexieBulkStore(db, sync),
    sync,
  };
}
