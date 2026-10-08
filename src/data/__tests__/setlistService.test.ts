import { beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../../core/ids';
import { addBlock, addItem, moveItem, removeBlock, sortedBlocks, itemsOfBlock } from '../../core/setlistOps';
import { bootstrap } from '../bootstrap';
import { createDexieStore } from '../dexie/dexieRepository';
import { createSetlist, deleteSetlist, duplicateSetlist, loadTree, persistTree } from '../setlistService';

let n = 0;
let clock = 1_000;
const fresh = () => createDexieStore({ dbName: `svc-${++n}`, now: () => ++clock });

describe('setlist service', () => {
  let store: ReturnType<typeof fresh>;
  let bandId: string;
  let setlistId: string;

  beforeEach(async () => {
    store = fresh();
    bandId = (await bootstrap(store)).id;
    setlistId = (await store.setlists.listBy('bandId', bandId))[0]!.id;
  });

  it('loads the seeded setlist as a tree', async () => {
    const tree = await loadTree(store, setlistId);
    expect(tree?.blocks).toHaveLength(5);
    expect(tree?.items).toHaveLength(22);
  });

  it('creates an empty setlist with one block', async () => {
    const created = await createSetlist(store, bandId, { title: 'New', firstBlock: 'Block 1' });
    const tree = await loadTree(store, created.id);
    expect(tree?.blocks.map((b) => b.name)).toEqual(['Block 1']);
    expect(tree?.items).toEqual([]);
  });

  it('persists edits, undo and redo as diffs, including a removed block with its items', async () => {
    const original = (await loadTree(store, setlistId))!;
    const ctx = { bandId, now: 5_000, newId };
    const [first] = sortedBlocks(original);

    const edited = removeBlock(addBlock(original, ctx, 'Encore'), first!.id);
    await persistTree(store, original, edited);
    let stored = (await loadTree(store, setlistId))!;
    expect(stored.blocks).toHaveLength(5); // -1 +1
    expect(stored.items).toHaveLength(22 - 4);

    // undo: the removed block and its items come back
    await persistTree(store, edited, original);
    stored = (await loadTree(store, setlistId))!;
    expect(stored.blocks).toHaveLength(5);
    expect(stored.items).toHaveLength(22);
    expect(stored.blocks.some((b) => b.name === 'Encore')).toBe(false);

    // redo
    await persistTree(store, original, edited);
    stored = (await loadTree(store, setlistId))!;
    expect(stored.items).toHaveLength(18);
    expect(stored.blocks.some((b) => b.name === 'Encore')).toBe(true);
  });

  it('persists a move between blocks', async () => {
    const original = (await loadTree(store, setlistId))!;
    const ctx = { bandId, now: 6_000, newId };
    const [b1, b2] = sortedBlocks(original) as unknown as [{ id: string }, { id: string }];
    const moving = itemsOfBlock(original, b1.id)[0]!;
    const moved = moveItem(original, ctx, moving.id, b2.id, 1);
    await persistTree(store, original, moved);
    const stored = (await loadTree(store, setlistId))!;
    expect(itemsOfBlock(stored, b2.id)[1]?.id).toBe(moving.id);
    expect(itemsOfBlock(stored, b1.id)).toHaveLength(3);
  });

  it('adds an item and persists it', async () => {
    const original = (await loadTree(store, setlistId))!;
    const [b1] = sortedBlocks(original);
    const song = (await store.songs.listBy('bandId', bandId))[0]!;
    const next = addItem(original, { bandId, now: 7_000, newId }, b1!.id, song.id);
    await persistTree(store, original, next);
    expect((await loadTree(store, setlistId))!.items).toHaveLength(23);
  });

  it('duplicates a setlist without touching the original', async () => {
    const copy = await duplicateSetlist(store, setlistId, 'Example setlist (copy)');
    expect(copy?.title).toBe('Example setlist (copy)');
    const tree = (await loadTree(store, copy!.id))!;
    expect(tree.blocks).toHaveLength(5);
    expect(tree.items).toHaveLength(22);
    expect((await loadTree(store, setlistId))!.items).toHaveLength(22);
    expect(await store.setlists.listBy('bandId', bandId)).toHaveLength(2);
  });

  it('deletes a setlist in cascade, freeing its songs from "in use"', async () => {
    const song = (await store.songs.listBy('bandId', bandId)).find((s) => s.title === 'Creep')!;
    expect((await store.items.listBy('songId', song.id)).length).toBe(1);
    await deleteSetlist(store, setlistId);
    expect(await loadTree(store, setlistId)).toBeUndefined();
    expect(await store.items.listBy('songId', song.id)).toHaveLength(0);
    expect(await store.items.listBy('bandId', bandId)).toHaveLength(0);
    expect(await store.setlists.listBy('bandId', bandId)).toHaveLength(0);
  });
});
