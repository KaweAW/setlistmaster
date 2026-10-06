import { z } from 'zod';

/** Zod schemas are the single source of truth for domain types (see types.ts). */

const id = z.string().min(1);
const timestamp = z.number().int().nonnegative(); // epoch milliseconds
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const baseShape = {
  id,
  createdAt: timestamp,
  updatedAt: timestamp,
  /** Soft delete: set instead of removing the record (needed for future sync). */
  deletedAt: timestamp.optional(),
};

const scopedShape = { ...baseShape, bandId: id };

export const bandSchema = z.object({ ...baseShape, name: z.string().min(1) });

export const memberRoleSchema = z.enum(['owner', 'editor', 'viewer']);
export const memberSchema = z.object({
  ...scopedShape,
  userId: id,
  role: memberRoleSchema,
});

export const performerSchema = z.object({
  ...scopedShape,
  name: z.string().min(1),
  color: hexColor,
  symbol: z.string().min(1),
});

export const tuningSchema = z.object({
  ...scopedShape,
  name: z.string().min(1),
  /** Free display text, e.g. "D-G-C-F-A-D". */
  notes: z.string().default(''),
  isStandard: z.boolean().default(false),
});

export const songSchema = z.object({
  ...scopedShape,
  title: z.string().min(1),
  artist: z.string().default(''),
  key: z.string().optional(),
  capo: z.number().int().min(0).max(12).default(0),
  tempo: z.number().int().positive().optional(),
  durationSec: z.number().int().positive().optional(),
  tuningId: id,
  defaultPerformerIds: z.array(id).default([]),
  /** Lyrics with chords, ChordPro format. */
  chordpro: z.string().default(''),
  pdfBlobId: id.optional(),
  notes: z.string().default(''),
  tags: z.array(z.string()).default([]),
});

export const setlistSchema = z.object({
  ...scopedShape,
  title: z.string().min(1),
  /** ISO date (YYYY-MM-DD), optional. */
  date: z.string().optional(),
  venue: z.string().default(''),
  notes: z.string().default(''),
  archived: z.boolean().default(false),
});

/** Fractional index string used to order siblings. */
const position = z.string().min(1);

export const blockSchema = z.object({
  ...scopedShape,
  setlistId: id,
  name: z.string().min(1),
  subtitle: z.string().default(''),
  position,
});

export const transitionTypeSchema = z.enum(['segue', 'stop', 'none']);

export const setlistItemSchema = z.object({
  ...scopedShape,
  /** Denormalised from the block to query a whole setlist in one go. */
  setlistId: id,
  blockId: id,
  songId: id,
  position,
  /** Empty = inherit song.defaultPerformerIds. */
  performerIds: z.array(id).default([]),
  performerNote: z.string().default(''),
  /** Undefined = inherit song.tuningId. */
  tuningOverrideId: id.optional(),
  transitionType: transitionTypeSchema.default('none'),
  /** Plain text; **double asterisks** mark bold (see emphasis.ts). */
  transitionText: z.string().default(''),
  notes: z.string().default(''),
});
