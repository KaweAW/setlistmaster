import type { SyncRecord } from '../core/sync';
import type { SyncStore } from '../data/repository';

/** The server side of sync, as the engine sees it. Implemented for Supabase, and by test doubles. */
export interface RemoteClient {
  push(bandId: string, records: SyncRecord[]): Promise<void>;
  /** Records with `seq` greater than `afterSeq`, oldest first, each carrying its `seq`. */
  pull(bandId: string, afterSeq: number, limit: number): Promise<SyncRecord[]>;
  /** The bytes of a PDF (cloud storage). `downloadBlob` answers null when the object is not there (yet). */
  uploadBlob(bandId: string, id: string, data: ArrayBuffer, mimeType: string): Promise<void>;
  downloadBlob(bandId: string, id: string): Promise<ArrayBuffer | null>;
  removeBlob(bandId: string, id: string): Promise<void>;
  /** Live changes. Returns the function that stops listening. `onState('live')` means we are connected (again). */
  subscribe(bandId: string, onRecord: (record: SyncRecord) => void, onState: (state: 'live' | 'down') => void): () => void;
}

/** `network`: no connection (retry later). `forbidden`: we are no longer allowed (removed from the band, or read-only). */
export class RemoteError extends Error {
  constructor(
    public readonly code: 'network' | 'forbidden' | 'other',
    message: string,
  ) {
    super(message);
  }
}

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'revoked';

export interface BandSyncStatus {
  state: SyncState;
  /** Local changes not yet sent. */
  pending: number;
  lastSyncedAt: number | null;
  message?: string;
}

export interface EngineHooks {
  /** Called when changes from the cloud were written locally (screens should refresh). */
  onApplied: () => void;
  onStatus: (bandId: string, status: BandSyncStatus) => void;
  /** Viewers only read: when this says no, local changes stay on the device and nothing is sent. Default: yes. */
  canWrite?: (bandId: string) => boolean;
}

/**
 * Local-first sync: edits are written locally at once and queued; the engine sends the queue and reads what
 * is new on the server. Both directions are idempotent, so a failure at any point just means "try again".
 */
export class SyncEngine {
  private readonly running = new Map<string, Promise<void>>();
  private readonly again = new Set<string>();
  private readonly watchers = new Map<string, () => void>();
  private readonly lastSynced = new Map<string, number>();

  constructor(
    private readonly store: SyncStore,
    private readonly remote: RemoteClient,
    private readonly hooks: EngineHooks,
    private readonly now: () => number = Date.now,
    private readonly batch = { push: 100, pull: 500 },
  ) {}

  /** Sends what is queued, then reads what is new. Calls made while a sync runs are folded into one more round. */
  syncBand(bandId: string): Promise<void> {
    const current = this.running.get(bandId);
    if (current) {
      this.again.add(bandId);
      return current;
    }
    const run = (async () => {
      do {
        this.again.delete(bandId);
        await this.round(bandId);
      } while (this.again.has(bandId));
    })().finally(() => this.running.delete(bandId));
    this.running.set(bandId, run);
    return run;
  }

  async syncAll(): Promise<void> {
    await Promise.all((await this.store.linkedBands()).map((id) => this.syncBand(id)));
  }

  /** Listens for live changes of a band. */
  watch(bandId: string): void {
    if (this.watchers.has(bandId)) return;
    const stop = this.remote.subscribe(
      bandId,
      (record) => {
        void this.store.applyRemote([record]).then((n) => n > 0 && this.hooks.onApplied());
      },
      (state) => {
        if (state === 'live') void this.syncBand(bandId); // (re)connected: catch up on whatever was missed
      },
    );
    this.watchers.set(bandId, stop);
  }

  unwatch(bandId: string): void {
    this.watchers.get(bandId)?.();
    this.watchers.delete(bandId);
  }

  stop(): void {
    [...this.watchers.keys()].forEach((id) => this.unwatch(id));
  }

  private async round(bandId: string): Promise<void> {
    await this.report(bandId, 'syncing');
    try {
      if (this.hooks.canWrite?.(bandId) ?? true) await this.push(bandId);
      await this.pull(bandId);
      await this.transferBlobs(bandId);
      this.lastSynced.set(bandId, this.now());
      await this.report(bandId, 'idle');
    } catch (error) {
      const code = error instanceof RemoteError ? error.code : 'other';
      const state: SyncState = code === 'network' ? 'offline' : code === 'forbidden' ? 'revoked' : 'error';
      await this.report(bandId, state, error instanceof Error ? error.message : String(error));
    }
  }

  private async push(bandId: string): Promise<void> {
    for (;;) {
      const entries = await this.store.pending(bandId, this.batch.push);
      if (entries.length === 0) return;
      const records = await this.store.readRecords(entries);
      if (records.length > 0) await this.remote.push(bandId, records);
      // A PDF that was removed: its bytes in storage are no use to anyone (best effort, never blocks the sync).
      for (const r of records) if (r.kind === 'attachment' && r.deletedAt !== null) await this.remote.removeBlob(bandId, r.id).catch(() => {});
      await this.store.ack(entries);
    }
  }

  /** PDFs: send the ones the cloud has not got, then fetch the ones this device is missing (so charts work offline on stage). */
  private async transferBlobs(bandId: string): Promise<void> {
    if (this.hooks.canWrite?.(bandId) ?? true) {
      for (const file of await this.store.pendingBlobs(bandId)) {
        await this.remote.uploadBlob(bandId, file.id, file.data, file.mimeType);
        await this.store.markBlobUploaded(file.id);
      }
    }
    let fetched = 0;
    for (const attachment of await this.store.missingBlobs(bandId)) {
      const data = await this.remote.downloadBlob(bandId, attachment.id);
      if (!data) continue; // the author has not uploaded it yet: a later round gets it
      await this.store.saveBlob(attachment, data);
      fetched++;
    }
    if (fetched > 0) this.hooks.onApplied();
  }

  private async pull(bandId: string): Promise<void> {
    let cursor = await this.store.cursor(bandId);
    for (;;) {
      const records = await this.remote.pull(bandId, cursor, this.batch.pull);
      if (records.length === 0) return;
      if ((await this.store.applyRemote(records)) > 0) this.hooks.onApplied();
      cursor = records[records.length - 1]!.seq ?? cursor;
      await this.store.setCursor(bandId, cursor);
      if (records.length < this.batch.pull) return;
    }
  }

  private async report(bandId: string, state: SyncState, message?: string): Promise<void> {
    this.hooks.onStatus(bandId, {
      state,
      pending: await this.store.pendingCount(bandId),
      lastSyncedAt: this.lastSynced.get(bandId) ?? null,
      ...(message ? { message } : {}),
    });
  }
}
