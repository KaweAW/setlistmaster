import Dexie, { type EntityTable } from 'dexie';
import type { SyncKind } from '../../core/sync';
import type {
  Band,
  Block,
  Member,
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
  }
}
