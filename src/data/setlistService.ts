import { newId } from '../core/ids';
import { positionBetween } from '../core/ordering';
import { cloneTree, diffTree, type OpContext, type SetlistTree } from '../core/setlistOps';
import type { Setlist } from '../core/types';
import type { DataStore } from './repository';

/** Reads a whole setlist (setlist + blocks + items). Undefined if it does not exist or was deleted. */
export async function loadTree(store: DataStore, setlistId: string): Promise<SetlistTree | undefined> {
  const setlist = await store.setlists.get(setlistId);
  if (!setlist) return undefined;
  const [blocks, items] = await Promise.all([
    store.blocks.listBy('setlistId', setlistId),
    store.items.listBy('setlistId', setlistId),
  ]);
  return { setlist, blocks, items };
}

/** Creates an empty setlist with its first block. */
export async function createSetlist(
  store: DataStore,
  bandId: string,
  names: { title: string; firstBlock: string },
): Promise<Setlist> {
  const setlist = await store.setlists.create({
    bandId, title: names.title, venue: '', notes: '', archived: false,
  });
  await store.blocks.create({
    bandId, setlistId: setlist.id, name: names.firstBlock, subtitle: '', position: positionBetween(null, null),
  });
  return setlist;
}

/** Writes the difference between two snapshots. Used for every edit, undo and redo. */
export async function persistTree(store: DataStore, before: SetlistTree, after: SetlistTree): Promise<void> {
  const diff = diffTree(before, after);
  if (diff.setlist) await store.setlists.put(diff.setlist);
  for (const block of diff.upsertBlocks) await store.blocks.put(block);
  for (const item of diff.upsertItems) await store.items.put(item);
  for (const id of diff.removeItemIds) await store.items.remove(id);
  for (const id of diff.removeBlockIds) await store.blocks.remove(id);
}

/** Copies a setlist (blocks and items included) under a new title. */
export async function duplicateSetlist(
  store: DataStore,
  setlistId: string,
  title: string,
  now: () => number = Date.now,
): Promise<Setlist | undefined> {
  const tree = await loadTree(store, setlistId);
  if (!tree) return undefined;
  const ctx: OpContext = { bandId: tree.setlist.bandId, now: now(), newId };
  const copy = cloneTree(tree, ctx, title);
  await store.setlists.put(copy.setlist);
  for (const block of copy.blocks) await store.blocks.put(block);
  for (const item of copy.items) await store.items.put(item);
  return copy.setlist;
}

/** Soft-deletes the setlist and everything in it, so its songs are no longer considered "in use". */
export async function deleteSetlist(store: DataStore, setlistId: string): Promise<void> {
  const [blocks, items] = await Promise.all([
    store.blocks.listBy('setlistId', setlistId),
    store.items.listBy('setlistId', setlistId),
  ]);
  for (const item of items) await store.items.remove(item.id);
  for (const block of blocks) await store.blocks.remove(block.id);
  await store.setlists.remove(setlistId);
}
