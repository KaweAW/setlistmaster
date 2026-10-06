import Dexie, { type EntityTable } from 'dexie';
import type { SyncKind } from '../../core/sync';
import type {
  Attachment,
  Band,
  Block,
  Instrument,
  Member,
  Part,
  Performer,
  Setlist,
  SetlistItem,
  Song,
  StoredFile,
  Tuning,
} from '../../core/types';

/** A local change not yet sent to the cloud (latest edit of each record only). */
export interface OutboxRow {
  key: string; // `${kind}:${id}`
  bandId: string;
  kind: SyncKind;
  id: string;
  updatedAt: number;
}

/** A band that is synced with the cloud, and how far we have read its changes. */
export interface SyncBandRow {
  bandId: string;
  cursor: number;
  linkedAt: number;
}

export class ScalettaDb extends Dexie {
  bands!: EntityTable<Band, 'id'>;
  members!: EntityTable<Member, 'id'>;
  performers!: EntityTable<Performer, 'id'>;
  tunings!: EntityTable<Tuning, 'id'>;
  instruments!: EntityTable<Instrument, 'id'>;
  parts!: EntityTable<Part, 'id'>;
  attachments!: EntityTable<Attachment, 'id'>;
  songs!: EntityTable<Song, 'id'>;
  setlists!: EntityTable<Setlist, 'id'>;
  blocks!: EntityTable<Block, 'id'>;
  items!: EntityTable<SetlistItem, 'id'>;
  files!: EntityTable<StoredFile, 'id'>;
  outbox!: EntityTable<OutboxRow, 'key'>;
  syncBands!: EntityTable<SyncBandRow, 'bandId'>;

  constructor(name = 'scaletta') {
    super(name);
    // Schema versions must only ever be appended (new `this.version(n)`), never edited.
    this.version(1).stores({
      bands: 'id',
      members: 'id, bandId, userId',
      performers: 'id, bandId',
      tunings: 'id, bandId',
      songs: 'id, bandId, title',
      setlists: 'id, bandId, date',
      blocks: 'id, bandId, setlistId',
      items: 'id, bandId, setlistId, blockId, songId',
    });
    // v2 (phase 1): PDF attachments.
    this.version(2).stores({ files: 'id, bandId' });
    // v3 (phase 6): cloud sync bookkeeping.
    this.version(3).stores({ outbox: 'key, bandId', syncBands: 'bandId' });
    // v4 (phase 7): instruments and per-instrument parts of a song.
    this.version(4).stores({ instruments: 'id, bandId', parts: 'id, bandId, songId' });
    // v5: a song can have several PDFs, each for the text or for one instrument: index them by song, and tag the old ones.
    this.version(5)
      .stores({ files: 'id, bandId, songId' })
      .upgrade(async (tx) => {
        const songs = await tx.table('songs').toArray();
        for (const song of songs as { id: string; pdfBlobId?: string }[]) {
          if (song.pdfBlobId) await tx.table('files').update(song.pdfBlobId, { songId: song.id });
        }
      });
    // v6 (phase 8): a PDF is described by a synced `attachment` record; the bytes stay in `files`. Every PDF that already
    // belongs to a song gets its attachment (same id), and is queued for the cloud if its band is synced.
    this.version(6)
      .stores({ attachments: 'id, bandId, songId' })
      .upgrade(async (tx) => {
        const linked = new Set((await tx.table('syncBands').toArray()).map((r: { bandId: string }) => r.bandId));
        const now = Date.now();
        for (const f of (await tx.table('files').toArray()) as StoredFile[]) {
          if (!f.songId) continue;
          await tx.table('attachments').put({
            id: f.id, bandId: f.bandId, songId: f.songId, instrumentId: f.instrumentId, name: f.name,
            mimeType: f.mimeType || 'application/pdf', size: f.size, createdAt: f.createdAt, updatedAt: now,
          });
          if (linked.has(f.bandId)) {
            await tx.table('outbox').put({ key: `attachment:${f.id}`, bandId: f.bandId, kind: 'attachment', id: f.id, updatedAt: now });
          }
        }
      });
  }
}
