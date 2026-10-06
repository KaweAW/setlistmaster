/** Kinds of record that travel to the cloud (the band itself and its members are managed by the server). */
export const SYNC_KINDS = ['performer', 'tuning', 'song', 'setlist', 'block', 'item'] as const;
export type SyncKind = (typeof SYNC_KINDS)[number];

/** One local record as it is sent to, or received from, the cloud. `data` is the whole record. */
export interface SyncRecord {
  kind: SyncKind;
  id: string;
  bandId: string;
  data: Record<string, unknown>;
  updatedAt: number;
  deletedAt: number | null;
  /** Server order (only on records that came from the server). */
  seq?: number;
}

/** A local change waiting to be sent. `updatedAt` tells later edits of the same record apart. */
export interface OutboxEntry {
  key: string;
  bandId: string;
  kind: SyncKind;
  id: string;
  updatedAt: number;
}

/** Last write wins, per record: the incoming version only replaces the local one if it is strictly newer. */
export function shouldApplyRemote(local: { updatedAt: number } | undefined, remote: { updatedAt: number }): boolean {
  return !local || remote.updatedAt > local.updatedAt;
}
