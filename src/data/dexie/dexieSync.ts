import type { EntityTable } from 'dexie';
import * as s from '../../core/schemas';
import { SYNC_KINDS, shouldApplyRemote, type OutboxEntry, type SyncKind, type SyncRecord } from '../../core/sync';
import type { Attachment, BaseEntity, StoredFile } from '../../core/types';
import type { SyncStore } from '../repository';
import type { ScalettaDb } from './db';

type Row = BaseEntity & { bandId: string };

const SCHEMAS = {
  performer: s.performerSchema,
  tuning: s.tuningSchema,
  instrument: s.instrumentSchema,
  part: s.partSchema,
  attachment: s.attachmentSchema,
  song: s.songSchema,
  setlist: s.setlistSchema,
  block: s.blockSchema,
  item: s.setlistItemSchema,
} as const;

export class DexieSyncStore implements SyncStore {
  private readonly linked = new Set<string>();
  private readonly ready: Promise<void>;
  private readonly listeners = new Set<(bandId: string) => void>();

  constructor(private readonly db: ScalettaDb) {
    this.ready = db.syncBands.toArray().then((rows) => rows.forEach((r) => this.linked.add(r.bandId)));
  }

  private table(kind: SyncKind): EntityTable<Row, 'id'> {
    const tables = {
      performer: this.db.performers, tuning: this.db.tunings, instrument: this.db.instruments, part: this.db.parts, attachment: this.db.attachments, song: this.db.songs,
      setlist: this.db.setlists, block: this.db.blocks, item: this.db.items,
    };
    return tables[kind] as unknown as EntityTable<Row, 'id'>;
  }

  /** Called by the repositories after each write: queues the record if its band is synced. */
  async record(kind: SyncKind, record: Row): Promise<void> {
    await this.ready;
    if (!this.linked.has(record.bandId)) return;
    await this.db.outbox.put({ key: `${kind}:${record.id}`, bandId: record.bandId, kind, id: record.id, updatedAt: record.updatedAt });
    this.listeners.forEach((listener) => listener(record.bandId));
  }

  async linkBand(bandId: string, options: { upload?: boolean } = {}): Promise<void> {
    await this.ready;
    await this.db.syncBands.put({ bandId, cursor: 0, linkedAt: Date.now() });
    this.linked.add(bandId);
    if (!options.upload) return;
    for (const kind of SYNC_KINDS) {
      const rows = (await this.table(kind).where('bandId').equals(bandId).toArray()).filter((r) => r.deletedAt === undefined);
      await this.db.outbox.bulkPut(rows.map((r) => ({ key: `${kind}:${r.id}`, bandId, kind, id: r.id, updatedAt: r.updatedAt })));
    }
  }

  async unlinkBand(bandId: string): Promise<void> {
    await this.ready;
    this.linked.delete(bandId);
    await this.db.syncBands.delete(bandId);
    await this.db.outbox.where('bandId').equals(bandId).delete();
  }

  /** The database was replaced as a whole: drop the in-memory copy of the linked bands (the rows went with the tables). */
  async forgetAll(): Promise<void> {
    await this.ready;
    this.linked.clear();
  }

  async linkedBands(): Promise<string[]> {
    await this.ready;
    return [...this.linked];
  }

  async cursor(bandId: string): Promise<number> {
    return (await this.db.syncBands.get(bandId))?.cursor ?? 0;
  }

  async setCursor(bandId: string, cursor: number): Promise<void> {
    await this.db.syncBands.update(bandId, { cursor });
  }

  async pending(bandId: string, limit: number): Promise<OutboxEntry[]> {
    return this.db.outbox.where('bandId').equals(bandId).limit(limit).toArray();
  }

  pendingCount(bandId: string): Promise<number> {
    return this.db.outbox.where('bandId').equals(bandId).count();
  }

  async readRecords(entries: OutboxEntry[]): Promise<SyncRecord[]> {
    const out: SyncRecord[] = [];
    for (const entry of entries) {
      const row = await this.table(entry.kind).get(entry.id as never);
      if (!row) continue;
      out.push({
        kind: entry.kind, id: entry.id, bandId: row.bandId, data: row as unknown as Record<string, unknown>,
        updatedAt: row.updatedAt, deletedAt: row.deletedAt ?? null,
      });
    }
    return out;
  }

  async ack(entries: OutboxEntry[]): Promise<void> {
    await this.db.transaction('rw', this.db.outbox, async () => {
      for (const entry of entries) {
        const current = await this.db.outbox.get(entry.key);
        if (current && current.updatedAt === entry.updatedAt) await this.db.outbox.delete(entry.key);
      }
    });
  }

  async applyRemote(records: SyncRecord[]): Promise<number> {
    await this.ready;
    const { db } = this;
    let applied = 0;
    await db.transaction('rw', [db.performers, db.tunings, db.instruments, db.parts, db.attachments, db.files, db.songs, db.setlists, db.blocks, db.items, db.outbox], async () => {
      for (const record of records) {
        if (!this.linked.has(record.bandId)) continue; // only bands we sync
        const parsed = SCHEMAS[record.kind].safeParse(record.data);
        if (!parsed.success || parsed.data.bandId !== record.bandId) continue; // a damaged record never reaches the app
        const table = this.table(record.kind);
        const local = await table.get(record.id as never);
        if (local && (local as { bandId: string }).bandId !== record.bandId) continue; // an id from another band: never move it
        if (!shouldApplyRemote(local, record)) continue;
        await table.put(parsed.data as unknown as Row);
        if (record.kind === 'attachment' && record.deletedAt !== null) await db.files.delete(record.id); // its bytes are no use any more
        // The remote version won: our older queued edit of the same record is obsolete.
        const queued = await db.outbox.get(`${record.kind}:${record.id}`);
        if (queued && queued.updatedAt <= record.updatedAt) await db.outbox.delete(queued.key);
        applied++;
      }
    });
    return applied;
  }

  async pendingBlobs(bandId: string): Promise<StoredFile[]> {
    await this.ready;
    if (!this.linked.has(bandId)) return [];
    const files = (await this.db.files.where('bandId').equals(bandId).toArray()).filter((f) => f.uploaded !== true);
    const alive: StoredFile[] = [];
    for (const f of files) {
      const attachment = await this.db.attachments.get(f.id);
      if (attachment && attachment.deletedAt === undefined) alive.push(f);
    }
    return alive;
  }

  async markBlobUploaded(id: string): Promise<void> {
    await this.db.files.update(id, { uploaded: true });
  }

  async missingBlobs(bandId: string): Promise<Attachment[]> {
    await this.ready;
    if (!this.linked.has(bandId)) return [];
    const alive = (await this.db.attachments.where('bandId').equals(bandId).toArray()).filter((a) => a.deletedAt === undefined);
    const have = new Set((await this.db.files.where('bandId').equals(bandId).primaryKeys()) as string[]);
    return alive.filter((a) => !have.has(a.id));
  }

  async saveBlob(attachment: Attachment, data: ArrayBuffer): Promise<void> {
    await this.db.files.put({
      id: attachment.id, bandId: attachment.bandId, name: attachment.name, mimeType: attachment.mimeType, size: attachment.size,
      songId: attachment.songId, instrumentId: attachment.instrumentId, createdAt: attachment.createdAt, uploaded: true, data,
    });
  }

  onLocalChange(listener: (bandId: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
