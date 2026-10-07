import { newId } from '../core/ids';
import { partId } from './instruments';
import type { DataStore } from './repository';
import { loadTree } from './setlistService';

const norm = (s: string) => s.trim().toLocaleLowerCase();
const songKey = (s: { title: string; artist: string }) => `${norm(s.title)}|${norm(s.artist)}`;
const tuningKey = (t: { notes: string; name: string }) => (t.notes.trim() ? norm(t.notes).replace(/\s+/g, '') : norm(t.name));

/**
 * Copies a setlist into another band (the personal space or a shared one), under the same title.
 * What the setlist refers to is looked up in the target first and created only when missing:
 *  - songs by title + artist (a new one carries lyrics, chords, notes, tags and the parts of its instruments; PDFs are not copied),
 *  - performers by name, instruments by name, tunings by their notes (standard stays the target's standard).
 * Nothing in the source is touched. Returns the new setlist's id, or undefined if the source does not exist.
 */
export async function copySetlistToBand(
  store: DataStore,
  setlistId: string,
  targetBandId: string,
  now: () => number = Date.now,
): Promise<string | undefined> {
  const tree = await loadTree(store, setlistId);
  if (!tree) return undefined;
  const sourceBandId = tree.setlist.bandId;
  const stamp = { createdAt: now(), updatedAt: now() };

  const [srcSongs, srcPerf, srcTun, srcInst] = await Promise.all([
    store.songs.listBy('bandId', sourceBandId), store.performers.listBy('bandId', sourceBandId),
    store.tunings.listBy('bandId', sourceBandId), store.instruments.listBy('bandId', sourceBandId),
  ]);
  const [dstSongs, dstPerf, dstTun, dstInst] = await Promise.all([
    store.songs.listBy('bandId', targetBandId), store.performers.listBy('bandId', targetBandId),
    store.tunings.listBy('bandId', targetBandId), store.instruments.listBy('bandId', targetBandId),
  ]);

  // Performers.
  const perfMap = new Map<string, string>();
  const usedPerf = new Set([...tree.items.flatMap((i) => i.performerIds), ...srcSongs.flatMap((s) => s.defaultPerformerIds)]);
  for (const p of srcPerf.filter((x) => usedPerf.has(x.id))) {
    const found = dstPerf.find((d) => norm(d.name) === norm(p.name));
    if (found) { perfMap.set(p.id, found.id); continue; }
    const made = await store.performers.create({ bandId: targetBandId, name: p.name, color: p.color, symbol: p.symbol });
    dstPerf.push(made);
    perfMap.set(p.id, made.id);
  }

  // Tunings.
  const tunMap = new Map<string, string>();
  const dstStandard = dstTun.find((t) => t.isStandard) ?? dstTun[0];
  const mapTuning = async (id: string): Promise<string | undefined> => {
    const hit = tunMap.get(id);
    if (hit) return hit;
    const t = srcTun.find((x) => x.id === id);
    if (!t) return dstStandard?.id;
    const found = t.isStandard ? dstStandard : dstTun.find((d) => tuningKey(d) === tuningKey(t));
    if (found) { tunMap.set(id, found.id); return found.id; }
    const made = await store.tunings.create({ bandId: targetBandId, name: t.name, notes: t.notes, isStandard: false });
    dstTun.push(made);
    tunMap.set(id, made.id);
    return made.id;
  };

  // Instruments.
  const instMap = new Map<string, string>();
  const mapInstrument = async (id: string): Promise<string | undefined> => {
    const hit = instMap.get(id);
    if (hit) return hit;
    const i = srcInst.find((x) => x.id === id);
    if (!i) return undefined;
    const found = dstInst.find((d) => norm(d.name) === norm(i.name));
    if (found) { instMap.set(id, found.id); return found.id; }
    const made = await store.instruments.create({ bandId: targetBandId, name: i.name, order: dstInst.length });
    dstInst.push(made);
    instMap.set(id, made.id);
    return made.id;
  };

  // Songs.
  const songMap = new Map<string, string>();
  const byKey = new Map(dstSongs.map((s) => [songKey(s), s.id]));
  for (const id of new Set(tree.items.map((i) => i.songId))) {
    const s = srcSongs.find((x) => x.id === id);
    if (!s) continue;
    const existing = byKey.get(songKey(s));
    if (existing) { songMap.set(id, existing); continue; }
    const instrumentIds = (await Promise.all(s.instrumentIds.map(mapInstrument))).filter((x): x is string => !!x);
    const made = await store.songs.create({
      title: s.title, artist: s.artist, key: s.key, capo: s.capo, tempo: s.tempo, durationSec: s.durationSec,
      chordpro: s.chordpro, notes: s.notes, tags: [...s.tags],
      tuningId: (await mapTuning(s.tuningId)) ?? s.tuningId,
      defaultPerformerIds: s.defaultPerformerIds.flatMap((p) => perfMap.get(p) ?? []),
      instrumentIds,
      bandId: targetBandId,
    });
    songMap.set(id, made.id);
    byKey.set(songKey(s), made.id);
    for (const part of await store.parts.listBy('songId', s.id)) {
      const instrumentId = await mapInstrument(part.instrumentId);
      if (!instrumentId) continue;
      await store.parts.put({
        ...part, id: await partId(targetBandId, made.id, instrumentId), bandId: targetBandId, songId: made.id, instrumentId,
        deletedAt: undefined, ...stamp,
      });
    }
  }

  // The setlist itself.
  const newSetlistId = newId();
  const blockIds = new Map(tree.blocks.map((b) => [b.id, newId()]));
  await store.setlists.put({ ...tree.setlist, id: newSetlistId, bandId: targetBandId, archived: false, deletedAt: undefined, ...stamp });
  for (const b of tree.blocks) {
    await store.blocks.put({ ...b, id: blockIds.get(b.id)!, bandId: targetBandId, setlistId: newSetlistId, deletedAt: undefined, ...stamp });
  }
  for (const i of tree.items) {
    const blockId = blockIds.get(i.blockId);
    const songId = songMap.get(i.songId);
    if (!blockId || !songId) continue;
    await store.items.put({
      ...i, id: newId(), bandId: targetBandId, setlistId: newSetlistId, blockId, songId,
      performerIds: i.performerIds.flatMap((p) => perfMap.get(p) ?? []),
      tuningOverrideId: i.tuningOverrideId ? await mapTuning(i.tuningOverrideId) : undefined,
      deletedAt: undefined, ...stamp,
    });
  }
  return newSetlistId;
}
