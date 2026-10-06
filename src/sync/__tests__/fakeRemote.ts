import type { SyncRecord } from '../../core/sync';
import { RemoteError, type RemoteClient } from '../engine';

/** An in-memory "server": last write wins per record, a sequence number per applied write, and failures on demand. */
export class FakeRemote implements RemoteClient {
  readonly rows = new Map<string, SyncRecord>(); // key: band/kind/id
  private seq = 0;
  readonly blobs = new Map<string, { data: ArrayBuffer; mimeType: string }>(); // key: band/id
  failWith: RemoteError | null = null;
  uploads = 0;
  downloads = 0;
  pushes = 0;
  beforePush: (() => Promise<void>) | null = null;
  private readonly subscribers = new Set<{ bandId: string; onRecord: (r: SyncRecord) => void; onState: (s: 'live' | 'down') => void }>();

  async push(bandId: string, records: SyncRecord[]): Promise<void> {
    if (this.failWith) throw this.failWith;
    await this.beforePush?.();
    this.pushes++;
    for (const record of records) {
      const key = `${bandId}/${record.kind}/${record.id}`;
      const existing = this.rows.get(key);
      if (existing && existing.updatedAt >= record.updatedAt) continue;
      const stored = { ...record, seq: ++this.seq };
      this.rows.set(key, stored);
      this.subscribers.forEach((s) => s.bandId === bandId && s.onRecord(stored));
    }
  }

  async pull(bandId: string, afterSeq: number, limit: number): Promise<SyncRecord[]> {
    if (this.failWith) throw this.failWith;
    return [...this.rows.values()]
      .filter((r) => r.bandId === bandId && r.seq! > afterSeq)
      .sort((a, b) => a.seq! - b.seq!)
      .slice(0, limit);
  }

  async uploadBlob(bandId: string, id: string, data: ArrayBuffer, mimeType: string): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.uploads++;
    this.blobs.set(`${bandId}/${id}`, { data, mimeType });
  }

  async downloadBlob(bandId: string, id: string): Promise<ArrayBuffer | null> {
    if (this.failWith) throw this.failWith;
    this.downloads++;
    return this.blobs.get(`${bandId}/${id}`)?.data ?? null;
  }

  async removeBlob(bandId: string, id: string): Promise<void> {
    this.blobs.delete(`${bandId}/${id}`);
  }

  subscribe(bandId: string, onRecord: (r: SyncRecord) => void, onState: (s: 'live' | 'down') => void) {
    const sub = { bandId, onRecord, onState };
    this.subscribers.add(sub);
    return () => void this.subscribers.delete(sub);
  }

  connected(bandId: string) {
    this.subscribers.forEach((s) => s.bandId === bandId && s.onState('live'));
  }
}
