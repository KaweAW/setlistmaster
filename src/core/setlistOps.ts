import { positionBetween, positionForIndex, sortByPosition } from './ordering';
import type { Block, Setlist, SetlistItem } from './types';

/**
 * A whole setlist as plain data. Every edit is a pure function tree → tree, so undo/redo is just
 * keeping snapshots and persisting is a diff between two snapshots (see diffTree).
 */
export interface SetlistTree {
  setlist: Setlist;
  blocks: Block[];
  items: SetlistItem[];
}

export interface OpContext {
  bandId: string;
  /** Timestamp stamped on every record an operation touches. */
  now: number;
  newId: () => string;
}

export function sortedBlocks(tree: SetlistTree): Block[] {
  return sortByPosition(tree.blocks);
}

export function itemsOfBlock(tree: SetlistTree, blockId: string): SetlistItem[] {
  return sortByPosition(tree.items.filter((i) => i.blockId === blockId));
}

export function updateSetlist(
  tree: SetlistTree,
  ctx: OpContext,
  patch: Partial<Pick<Setlist, 'title' | 'date' | 'venue' | 'notes' | 'archived'>>,
): SetlistTree {
  return { ...tree, setlist: { ...tree.setlist, ...patch, updatedAt: ctx.now } };
}

export function addBlock(tree: SetlistTree, ctx: OpContext, name: string, subtitle = ''): SetlistTree {
  const last = sortedBlocks(tree).at(-1);
  const block: Block = {
    id: ctx.newId(),
    bandId: ctx.bandId,
    setlistId: tree.setlist.id,
    name,
    subtitle,
    position: positionBetween(last?.position ?? null, null),
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  return { ...tree, blocks: [...tree.blocks, block] };
}

export function updateBlock(
  tree: SetlistTree,
  ctx: OpContext,
  blockId: string,
  patch: Partial<Pick<Block, 'name' | 'subtitle'>>,
): SetlistTree {
  return {
    ...tree,
    blocks: tree.blocks.map((b) => (b.id === blockId ? { ...b, ...patch, updatedAt: ctx.now } : b)),
  };
}

/** Removes the block and the items it contains. */
export function removeBlock(tree: SetlistTree, blockId: string): SetlistTree {
  return {
    ...tree,
    blocks: tree.blocks.filter((b) => b.id !== blockId),
    items: tree.items.filter((i) => i.blockId !== blockId),
  };
}

/** Moves a block so it ends up at `toIndex` of the ordered block list. */
export function moveBlock(tree: SetlistTree, ctx: OpContext, blockId: string, toIndex: number): SetlistTree {
  const all = sortedBlocks(tree);
  const from = all.findIndex((b) => b.id === blockId);
  const moving = all[from];
  if (!moving) return tree;
  const target = Math.max(0, Math.min(toIndex, all.length - 1));
  if (target === from) return tree;
  const others = all.filter((b) => b.id !== blockId);
  const position = positionForIndex(others, target);
  return {
    ...tree,
    blocks: tree.blocks.map((b) => (b.id === blockId ? { ...moving, position, updatedAt: ctx.now } : b)),
  };
}

/** Adds a song to a block at `index` (default: end). */
export function addItem(
  tree: SetlistTree,
  ctx: OpContext,
  blockId: string,
  songId: string,
  index?: number,
): SetlistTree {
  const siblings = itemsOfBlock(tree, blockId);
  const item: SetlistItem = {
    id: ctx.newId(),
    bandId: ctx.bandId,
    setlistId: tree.setlist.id,
    blockId,
    songId,
    position: positionForIndex(siblings, index ?? siblings.length),
    performerIds: [],
    performerNote: '',
    transitionType: 'none',
    transitionText: '',
    notes: '',
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  return { ...tree, items: [...tree.items, item] };
}

export type ItemPatch = Partial<
  Pick<
    SetlistItem,
    'performerIds' | 'performerNote' | 'tuningOverrideId' | 'transitionType' | 'transitionText' | 'notes'
  >
>;

export function updateItem(tree: SetlistTree, ctx: OpContext, itemId: string, patch: ItemPatch): SetlistTree {
  return {
    ...tree,
    items: tree.items.map((i) => (i.id === itemId ? { ...i, ...patch, updatedAt: ctx.now } : i)),
  };
}

export function removeItem(tree: SetlistTree, itemId: string): SetlistTree {
  return { ...tree, items: tree.items.filter((i) => i.id !== itemId) };
}

/**
 * Moves an item to `toIndex` of the destination block, counted among the block's *other* items
 * (so for a move inside a block, `toIndex` is simply the final index). Returns the same tree if nothing changes.
 */
export function moveItem(
  tree: SetlistTree,
  ctx: OpContext,
  itemId: string,
  toBlockId: string,
  toIndex: number,
): SetlistTree {
  const item = tree.items.find((i) => i.id === itemId);
  if (!item) return tree;
  const siblings = itemsOfBlock(tree, toBlockId).filter((i) => i.id !== itemId);
  const target = Math.max(0, Math.min(toIndex, siblings.length));
  if (item.blockId === toBlockId) {
    const current = itemsOfBlock(tree, toBlockId).findIndex((i) => i.id === itemId);
    if (current === target) return tree;
  }
  const position = positionForIndex(siblings, target);
  return {
    ...tree,
    items: tree.items.map((i) =>
      i.id === itemId ? { ...item, blockId: toBlockId, position, updatedAt: ctx.now } : i,
    ),
  };
}

/** True when both lists contain the same ids, in any order. */
export function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/** Deep copy of a setlist with fresh ids (used to duplicate it). */
export function cloneTree(tree: SetlistTree, ctx: OpContext, title: string): SetlistTree {
  const setlistId = ctx.newId();
  const blockIds = new Map(tree.blocks.map((b) => [b.id, ctx.newId()]));
  const stamp = { createdAt: ctx.now, updatedAt: ctx.now };
  return {
    setlist: { ...tree.setlist, id: setlistId, title, archived: false, deletedAt: undefined, ...stamp },
    blocks: tree.blocks.map((b) => ({
      ...b,
      id: blockIds.get(b.id)!,
      setlistId,
      deletedAt: undefined,
      ...stamp,
    })),
    items: tree.items.flatMap((i) => {
      const blockId = blockIds.get(i.blockId);
      return blockId
        ? [{ ...i, id: ctx.newId(), setlistId, blockId, deletedAt: undefined, ...stamp }]
        : [];
    }),
  };
}

export interface TreeDiff {
  setlist: Setlist | null;
  upsertBlocks: Block[];
  removeBlockIds: string[];
  upsertItems: SetlistItem[];
  removeItemIds: string[];
}

const same = (a: object, b: object): boolean =>
  JSON.stringify(a, Object.keys(a).sort()) === JSON.stringify(b, Object.keys(b).sort());

function diffById<T extends { id: string }>(before: readonly T[], after: readonly T[]) {
  const beforeById = new Map(before.map((r) => [r.id, r]));
  const afterIds = new Set(after.map((r) => r.id));
  return {
    upsert: after.filter((r) => {
      const old = beforeById.get(r.id);
      return !old || !same(old, r);
    }),
    remove: before.filter((r) => !afterIds.has(r.id)).map((r) => r.id),
  };
}

/** What must be written to turn `before` into `after`. Works in both directions (undo and redo). */
export function diffTree(before: SetlistTree, after: SetlistTree): TreeDiff {
  const blocks = diffById(before.blocks, after.blocks);
  const items = diffById(before.items, after.items);
  return {
    setlist: same(before.setlist, after.setlist) ? null : after.setlist,
    upsertBlocks: blocks.upsert,
    removeBlockIds: blocks.remove,
    upsertItems: items.upsert,
    removeItemIds: items.remove,
  };
}
