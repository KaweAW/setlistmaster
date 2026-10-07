import { newId } from '../core/ids';
import { partId } from './instruments';
import type { DataStore } from './repository';
import { loadTree } from './setlistService';
import { stringsOf, tuningIdFor } from './tunings';

const norm = (s: string) => s.trim().toLocaleLowerCase();
const songKey = (s: { title: string; artist: string }) => `${norm(s.title)}|${norm(s.artist)}`;

/**
 * Carries records from one band to another. What a song refers to is looked up in the target first and created only
 * when missing: songs by title + artist (a new one brings lyrics, chords, notes, tags and the parts of its instruments;
 * PDFs are not copied), performers and instruments by name, tunings by their strings (standard stays the target's standard).
 */
async function copier(store: DataStore, sourceBandId: string, targetBandId: string, now: () => number) {
  const [srcSongs, srcPerf, srcTun, srcInst] = await Promise.all([
    store.songs.listBy('bandId', sourceBandId), store.performers.listBy('bandId', sourceBandId),
    store.tunings.listBy('bandId', sourceBandId), store.instruments.listBy('bandId', sourceBandId),
  ]);
  const [dstSongs, dstPerf, dstInst] = await Promise.all([
    store.songs.listBy('bandId', targetBandId), store.performers.listBy('bandId', targetBandId),
    store.instruments.listBy('bandId', targetBandId),
  ]);
  const perfMap = new Map<string, string>();
  const tunMap = new Map<string, string>();
  const instMap = new Map<string, string>();
  const songMap = new Map<string, string>();
  const byKey = new Map(dstSongs.map((s) => [songKey(s), s.id]));

  const mapPerformer = async (id: string): Promise<string | undefined> => {
    const hit = perfMap.get(id);
    if (hit) return hit;
    const p = srcPerf.find((x) => x.id === id);
    if (!p) return undefined;
    let found = dstPerf.find((d) => norm(d.name) === norm(p.name));
    if (!found) {
      found = await store.performers.create({ bandId: targetBandId, name: p.name, color: p.color, symbol: p.symbol });
      dstPerf.push(found);
    }
    perfMap.set(id, found.id);
    return found.id;
  };

  const mapTuning = async (id: string): Promise<string | undefined> => {
    const hit = tunMap.get(id);
    if (hit) return hit;
    const t = srcTun.find((x) => x.id === id);
    if (!t) return undefined;
    const strings = stringsOf(t);
    let to: string;
    if (strings) to = await tuningIdFor(store, targetBandId, strings);
    else {
      const list = await store.tunings.listBy('bandId', targetBandId);
      to = list.find((d) => norm(d.name) === norm(t.name))?.id
        ?? (await store.tunings.create({ bandId: targetBandId, name: t.name, notes: t.notes, isStandard: false })).id;
    }
    tunMap.set(id, to);
    return to;
  };

  const mapInstrument = async (id: string): Promise<string | undefined> => {
    const hit = instMap.get(id);
    if (hit) return hit;
    const i = srcInst.find((x) => x.id === id);
    if (!i) return undefined;
    let found = dstInst.find((d) => norm(d.name) === norm(i.name));
    if (!found) {
      found = await store.instruments.create({ bandId: targetBandId, name: i.name, order: dstInst.length });
      dstInst.push(found);
    }
    instMap.set(id, found.id);
    return found.id;
  };

  /** The target's id for a source song, copying it when the target has none. `created` tells which happened. */
  const mapSong = async (id: string): Promise<{ id: string; created: boolean } | undefined> => {
    const known = songMap.get(id);
    if (known) return { id: known, created: false };
    const s = srcSongs.find((x) => x.id === id);
    if (!s) return undefined;
    const existing = byKey.get(songKey(s));
    if (existing) { songMap.set(id, existing); return { id: existing, created: false }; }
    const instrumentIds = (await Promise.all(s.instrumentIds.map(mapInstrument))).filter((x): x is string => !!x);
    const made = await store.songs.create({
      title: s.title, artist: s.artist, key: s.key, capo: s.capo, tempo: s.tempo, durationSec: s.durationSec,
      chordpro: s.chordpro, notes: s.notes, tags: [...s.tags],
      tuningId: (await mapTuning(s.tuningId)) ?? (await tuningIdFor(store, targetBandId, ['E', 'A', 'D', 'G', 'B', 'E'])),
      defaultPerformerIds: (await Promise.all(s.defaultPerformerIds.map(mapPerformer))).filter((x): x is string => !!x),
      instrumentIds,
      bandId: targetBandId,
    });
    songMap.set(id, made.id);
    byKey.set(songKey(s), made.id);
    const stamp = { createdAt: now(), updatedAt: now() };
    for (const part of await store.parts.listBy('songId', s.id)) {
      const instrumentId = await mapInstrument(part.instrumentId);
      if (!instrumentId) continue;
      await store.parts.put({
        ...part, id: await partId(targetBandId, made.id, instrumentId), bandId: targetBandId, songId: made.id, instrumentId,
        deletedAt: undefined, ...stamp,
      });
    }
    return { id: made.id, created: true };
  };

  return { mapPerformer, mapTuning, mapSong };
}

/**
 * Copies a setlist into another band (the personal space or a shared one), under the same title, bringing the songs,
 * singers and tunings it uses (see `copier`). Nothing in the source is touched.
 * Returns the new setlist's id, or undefined if the source does not exist.
 */
export async function copySetlistToBand(
  store: DataStore,
  setlistId: string,
  targetBandId: string,
  now: () => number = Date.now,
): Promise<string | undefined> {
  const tree = await loadTree(store, setlistId);
  if (!tree) return undefined;
  const { mapPerformer, mapTuning, mapSong } = await copier(store, tree.setlist.bandId, targetBandId, now);
  const stamp = { createdAt: now(), updatedAt: now() };

  const songIds = new Map<string, string>();
  for (const id of new Set(tree.items.map((i) => i.songId))) {
    const mapped = await mapSong(id);
    if (mapped) songIds.set(id, mapped.id);
  }

  const newSetlistId = newId();
  const blockIds = new Map(tree.blocks.map((b) => [b.id, newId()]));
  await store.setlists.put({ ...tree.setlist, id: newSetlistId, bandId: targetBandId, archived: false, deletedAt: undefined, ...stamp });
  for (const b of tree.blocks) {
    await store.blocks.put({ ...b, id: blockIds.get(b.id)!, bandId: targetBandId, setlistId: newSetlistId, deletedAt: undefined, ...stamp });
  }
  for (const i of tree.items) {
    const blockId = blockIds.get(i.blockId);
    const songId = songIds.get(i.songId);
    if (!blockId || !songId) continue;
    await store.items.put({
      ...i, id: newId(), bandId: targetBandId, setlistId: newSetlistId, blockId, songId,
      performerIds: (await Promise.all(i.performerIds.map(mapPerformer))).filter((x): x is string => !!x),
      tuningOverrideId: i.tuningOverrideId ? await mapTuning(i.tuningOverrideId) : undefined,
      deletedAt: undefined, ...stamp,
    });
  }
  return newSetlistId;
}

export interface SongCopyResult {
  /** Songs that were not in the target and were added. */
  copied: number;
  /** Songs the target already had (same title and artist): left as they are. */
  existing: number;
}

/** Copies single songs into another band (the personal space or a shared one). The songs must belong to the same band. */
export async function copySongsToBand(
  store: DataStore,
  songIds: readonly string[],
  targetBandId: string,
  now: () => number = Date.now,
): Promise<SongCopyResult> {
  const result: SongCopyResult = { copied: 0, existing: 0 };
  const first = songIds[0] ? await store.songs.get(songIds[0]) : undefined;
  if (!first) return result;
  const { mapSong } = await copier(store, first.bandId, targetBandId, now);
  for (const id of songIds) {
    const mapped = await mapSong(id);
    if (!mapped) continue;
    if (mapped.created) result.copied++;
    else result.existing++;
  }
  return result;
}
