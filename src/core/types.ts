import type { z } from 'zod';
import type {
  bandSchema,
  instrumentSchema,
  partSchema,
  blockSchema,
  memberRoleSchema,
  memberSchema,
  performerSchema,
  setlistItemSchema,
  setlistSchema,
  songSchema,
  transitionTypeSchema,
  tuningSchema,
} from './schemas';

export type Band = z.infer<typeof bandSchema>;
export type MemberRole = z.infer<typeof memberRoleSchema>;
export type Member = z.infer<typeof memberSchema>;
export type Performer = z.infer<typeof performerSchema>;
export type Tuning = z.infer<typeof tuningSchema>;
export type Instrument = z.infer<typeof instrumentSchema>;
export type Part = z.infer<typeof partSchema>;
export type Song = z.infer<typeof songSchema>;
export type Setlist = z.infer<typeof setlistSchema>;
export type Block = z.infer<typeof blockSchema>;
export type TransitionType = z.infer<typeof transitionTypeSchema>;
export type SetlistItem = z.infer<typeof setlistItemSchema>;

/** Fields shared by every stored record. */
export interface BaseEntity {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | undefined;
}

/** A file attached to a song (PDF chart). Hard-deleted; bytes are kept as ArrayBuffer for Safari reliability. */
export interface StoredFile {
  id: string;
  bandId: string;
  name: string;
  mimeType: string;
  size: number;
  data: ArrayBuffer;
  createdAt: number;
}

/** Every live (not deleted) record of the app: what a backup contains and what a restore writes. */
export interface StoreSnapshot {
  bands: Band[];
  members: Member[];
  performers: Performer[];
  tunings: Tuning[];
  instruments: Instrument[];
  parts: Part[];
  songs: Song[];
  setlists: Setlist[];
  blocks: Block[];
  items: SetlistItem[];
  files: StoredFile[];
}
