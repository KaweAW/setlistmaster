import { newId } from '../core/ids';
import type { Attachment } from '../core/types';
import type { DataStore } from './repository';

/** Attaches a PDF to a song (for the text, or for one instrument): the description is synced, the bytes are stored here. */
export async function addAttachment(
  store: DataStore,
  input: { id?: string; bandId: string; songId: string; instrumentId?: string | undefined; name: string; mimeType?: string; data: ArrayBuffer },
): Promise<Attachment> {
  const id = input.id ?? newId();
  const mimeType = input.mimeType || 'application/pdf';
  const attachment = await store.attachments.create({
    id, bandId: input.bandId, songId: input.songId, instrumentId: input.instrumentId, name: input.name, mimeType, size: input.data.byteLength,
  });
  await store.files.put({
    id, bandId: input.bandId, name: input.name, mimeType, size: input.data.byteLength, songId: input.songId,
    instrumentId: input.instrumentId, createdAt: attachment.createdAt, data: input.data,
  });
  return attachment;
}

export async function removeAttachment(store: DataStore, id: string): Promise<void> {
  await store.attachments.remove(id);
  await store.files.remove(id);
}

/** A song's PDFs, oldest first. */
export async function songAttachments(store: DataStore, songId: string): Promise<Attachment[]> {
  return (await store.attachments.listBy('songId', songId)).sort((a, b) => a.createdAt - b.createdAt);
}
