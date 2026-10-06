import type { SyncRecord } from '../../core/sync';
import { RemoteError, type RemoteClient } from '../engine';

/** An in-memory "server": last write wins per record, a sequence number per applied write, and failures on demand. */
export class FakeRemote implements RemoteClient {
  readonly rows = new Map<string, SyncRecord>(); // key: band/kind/id
  private seq = 0;
  failWith: RemoteError | null = null;
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

  subscribe(bandId: string, onRecord: (r: SyncRecord) => void, onState: (s: 'live' | 'down') => void) {
    const sub = { bandId, onRecord, onState };
    this.subscribers.add(sub);
    return () => void this.subscribers.delete(sub);
  }

  connected(bandId: string) {
    this.subscribers.forEach((s) => s.bandId === bandId && s.onState('live'));
  }
}
