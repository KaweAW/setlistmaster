import { z } from 'zod';
import {
  bandSchema, blockSchema, memberSchema, performerSchema, setlistItemSchema, setlistSchema, songSchema, tuningSchema,
} from './schemas';
import type { StoreSnapshot } from './types';

export const BACKUP_FORMAT = 'scaletta-backup';
/** Bump when the file layout changes; older versions must keep loading (see parseBackup). */
export const BACKUP_VERSION = 1;

/** PDFs travel inside the JSON as base64, so a single file holds everything. */
const attachmentSchema = z.object({
  id: z.string().min(1),
  bandId: z.string().min(1),
  name: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
  dataBase64: z.string(),
});

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().positive(),
  exportedAt: z.number().int().nonnegative(),
  data: z.object({
    bands: z.array(bandSchema).min(1),
    members: z.array(memberSchema).default([]),
    performers: z.array(performerSchema).default([]),
    tunings: z.array(tuningSchema).default([]),
    songs: z.array(songSchema).default([]),
    setlists: z.array(setlistSchema).default([]),
    blocks: z.array(blockSchema).default([]),
    items: z.array(setlistItemSchema).default([]),
    files: z.array(attachmentSchema).default([]),
  }),
});

export type BackupFile = z.input<typeof backupSchema>;

export function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000; // spreading a whole PDF into fromCharCode would overflow the call stack
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export function base64ToBytes(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function createBackup(snapshot: StoreSnapshot, exportedAt: number): BackupFile {
  const { files, ...records } = snapshot;
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    data: {
      ...records,
      files: files.map(({ data, ...meta }) => ({ ...meta, dataBase64: bytesToBase64(data) })),
    },
  };
}

export interface BackupSummary {
  songs: number;
  setlists: number;
  performers: number;
  tunings: number;
  files: number;
}

export function summarizeSnapshot(snapshot: StoreSnapshot): BackupSummary {
  return {
    songs: snapshot.songs.length,
    setlists: snapshot.setlists.length,
    performers: snapshot.performers.length,
    tunings: snapshot.tunings.length,
    files: snapshot.files.length,
  };
}

export type BackupError = 'not-json' | 'wrong-format' | 'newer-version' | 'invalid-data';

export type BackupParseResult =
  | { ok: true; snapshot: StoreSnapshot; summary: BackupSummary; exportedAt: number }
  | { ok: false; error: BackupError };

/**
 * Reads and validates a backup file. Nothing is written anywhere: the caller shows the summary and asks
 * for confirmation first. Every record goes through the same schemas as live data.
 */
export function parseBackup(text: string): BackupParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not-json' };
  }
  const header = raw as { format?: unknown; version?: unknown } | null;
  if (!header || typeof header !== 'object' || header.format !== BACKUP_FORMAT) {
    return { ok: false, error: 'wrong-format' };
  }
  if (typeof header.version === 'number' && header.version > BACKUP_VERSION) {
    return { ok: false, error: 'newer-version' };
  }
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid-data' };

  const { files, ...records } = parsed.data.data;
  let snapshot: StoreSnapshot;
  try {
    snapshot = {
      ...records,
      files: files.map(({ dataBase64, ...meta }) => ({ ...meta, data: base64ToBytes(dataBase64) })),
    };
  } catch {
    return { ok: false, error: 'invalid-data' }; // a PDF that is not valid base64
  }
  return { ok: true, snapshot, summary: summarizeSnapshot(snapshot), exportedAt: parsed.data.exportedAt };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface BackupReminderInput {
  now: number;
  lastBackupAt: number | null;
  /** When the app was first used on this device: the clock starts here if there was never a backup. */
  firstSeenAt: number | null;
  snoozedUntil: number | null;
  intervalDays?: number;
}

/** True when it is time to remind the user to make a backup. */
export function backupReminderDue({ now, lastBackupAt, firstSeenAt, snoozedUntil, intervalDays = 14 }: BackupReminderInput): boolean {
  if (snoozedUntil !== null && now < snoozedUntil) return false;
  const since = lastBackupAt ?? firstSeenAt;
  return since !== null && now - since >= intervalDays * DAY_MS;
}

/** Whole days since the last backup, or null if there never was one. */
export function daysSince(timestamp: number | null, now: number): number | null {
  return timestamp === null ? null : Math.floor((now - timestamp) / DAY_MS);
}
