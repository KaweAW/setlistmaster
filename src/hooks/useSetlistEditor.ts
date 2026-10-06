import { useCallback, useEffect, useRef, useState } from 'react';
import { newId } from '../core/ids';
import {
  canRedo, canUndo, createHistory, pushHistory, redoHistory, undoHistory, type History,
} from '../core/history';
import type { OpContext, SetlistTree } from '../core/setlistOps';
import type { Performer, Song, Tuning } from '../core/types';
import { useData } from '../data/DataProvider';
import { loadTree, persistTree } from '../data/setlistService';

export type EditorStatus = 'loading' | 'missing' | 'ready';

/**
 * Loads a setlist and lets the page edit it with undo/redo.
 * Every change is a pure function tree → tree; history keeps snapshots and each change is written
 * to IndexedDB right away as a diff (autosave), strictly in order.
 */
export function useSetlistEditor(setlistId: string | undefined) {
  const { store, band } = useData();
  const [status, setStatus] = useState<EditorStatus>('loading');
  const [history, setHistory] = useState<History<SetlistTree> | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [performers, setPerformers] = useState<Performer[]>([]);
  const [tunings, setTunings] = useState<Tuning[]>([]);
  const [saveError, setSaveError] = useState(false);

  // Source of truth between renders: handlers read it so rapid events never see stale state.
  const historyRef = useRef<History<SetlistTree> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tree = setlistId ? await loadTree(store, setlistId) : undefined;
      if (cancelled) return;
      if (!tree) return setStatus('missing');
      const [loadedSongs, loadedPerformers, loadedTunings] = await Promise.all([
        store.songs.listBy('bandId', band.id),
        store.performers.listBy('bandId', band.id),
        store.tunings.listBy('bandId', band.id),
      ]);
      if (cancelled) return;
      loadedPerformers.sort((a, b) => a.createdAt - b.createdAt);
      const initial = createHistory(tree);
      historyRef.current = initial;
      setHistory(initial);
      setSongs(loadedSongs);
      setPerformers(loadedPerformers);
      setTunings(loadedTunings);
      setStatus('ready');
    })().catch(() => {
      if (!cancelled) setStatus('missing');
    });
    return () => {
      cancelled = true;
    };
  }, [store, band.id, setlistId]);

  const commit = useCallback(
    (next: History<SetlistTree>, before: SetlistTree) => {
      historyRef.current = next;
      setHistory(next);
      queue.current = queue.current
        .then(() => persistTree(store, before, next.present))
        .catch(() => setSaveError(true));
    },
    [store],
  );

  const makeContext = useCallback((): OpContext => ({ bandId: band.id, now: Date.now(), newId }), [band.id]);

  /** Applies a change. Returning the same tree (or an equal one) is a no-op. */
  const apply = useCallback(
    (change: (tree: SetlistTree, ctx: OpContext) => SetlistTree) => {
      const current = historyRef.current;
      if (!current) return;
      const next = change(current.present, makeContext());
      if (next === current.present) return;
      commit(pushHistory(current, next), current.present);
    },
    [commit, makeContext],
  );

  const undo = useCallback(() => {
    const current = historyRef.current;
    if (!current) return;
    const next = undoHistory(current);
    if (next !== current) commit(next, current.present);
  }, [commit]);

  const redo = useCallback(() => {
    const current = historyRef.current;
    if (!current) return;
    const next = redoHistory(current);
    if (next !== current) commit(next, current.present);
  }, [commit]);

  /** Forgets undo steps (called when entering edit mode: undo only covers the current session). */
  const resetHistory = useCallback(() => {
    const current = historyRef.current;
    if (!current) return;
    const fresh = createHistory(current.present);
    historyRef.current = fresh;
    setHistory(fresh);
  }, []);

  /** Creates a song in the library (standard tuning, no singers yet) so it can be added right away. */
  const createSong = useCallback(
    async (title: string, artist: string): Promise<Song> => {
      const standard = tunings.find((x) => x.isStandard) ?? tunings[0];
      const song = await store.songs.create({
        bandId: band.id,
        title,
        artist,
        capo: 0,
        tuningId: standard?.id ?? '',
        defaultPerformerIds: [],
        chordpro: '',
        notes: '',
        tags: [],
      });
      setSongs((list) => [...list, song]);
      return song;
    },
    [store, band.id, tunings],
  );

  return {
    status,
    tree: history?.present ?? null,
    songs,
    performers,
    tunings,
    saveError,
    canUndo: history ? canUndo(history) : false,
    canRedo: history ? canRedo(history) : false,
    apply,
    undo,
    redo,
    resetHistory,
    createSong,
  };
}

export type SetlistEditorApi = ReturnType<typeof useSetlistEditor>;
