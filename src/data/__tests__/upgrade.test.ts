import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { ScalettaDb } from '../dexie/db';

/** The database as the previous release left it (schema v5), with a PDF attached to a song. */
async function legacy(name: string, linked: boolean) {
  const old = new Dexie(name);
  old.version(1).stores({
    bands: 'id', members: 'id, bandId, userId', performers: 'id, bandId', tunings: 'id, bandId', songs: 'id, bandId, title',
    setlists: 'id, bandId, date', blocks: 'id, bandId, setlistId', items: 'id, bandId, setlistId, blockId, songId',
  });
  old.version(2).stores({ files: 'id, bandId' });
  old.version(3).stores({ outbox: 'key, bandId', syncBands: 'bandId' });
  old.version(4).stores({ instruments: 'id, bandId', parts: 'id, bandId, songId' });
  old.version(5).stores({ files: 'id, bandId, songId' });
  await old.open();
  await old.table('files').bulkPut([
    { id: 'f1', bandId: 'b1', name: 'a.pdf', mimeType: 'application/pdf', size: 4, createdAt: 5, songId: 's1', instrumentId: 'i1', data: new ArrayBuffer(4) },
    { id: 'f2', bandId: 'b1', name: 'stray.pdf', mimeType: 'application/pdf', size: 1, createdAt: 6, data: new ArrayBuffer(1) }, // belongs to no song
  ]);
  if (linked) await old.table('syncBands').put({ bandId: 'b1', cursor: 3, linkedAt: 1 });
  old.close();
}

describe('upgrade to schema v6', () => {
  it('describes every PDF that belongs to a song, and keeps the bytes', async () => {
    await legacy('upgrade-a', false);
    const db = new ScalettaDb('upgrade-a');
    const attachments = await db.attachments.toArray();
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({ id: 'f1', bandId: 'b1', songId: 's1', instrumentId: 'i1', name: 'a.pdf', size: 4, createdAt: 5 });
    expect(await db.files.count()).toBe(2);
    expect(await db.outbox.count()).toBe(0); // a local band has nothing to send
    db.close();
  });

  it('queues the new descriptions for a band that is already synced', async () => {
    await legacy('upgrade-b', true);
    const db = new ScalettaDb('upgrade-b');
    expect((await db.outbox.toArray()).map((o) => [o.key, o.kind])).toEqual([['attachment:f1', 'attachment']]);
    db.close();
  });
});
