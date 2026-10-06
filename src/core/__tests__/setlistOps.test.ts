import { describe, expect, it } from 'vitest';
import {
  addBlock, addItem, cloneTree, diffTree, itemsOfBlock, moveBlock, moveItem, removeBlock,
  removeItem, sameIdSet, sortedBlocks, updateBlock, updateItem, updateSetlist, type OpContext, type SetlistTree,
} from '../setlistOps';
import { formatDate, formatTotalDuration } from '../format';

let counter = 0;
const ctx = (now = 1000): OpContext => ({ bandId: 'b', now, newId: () => `id${++counter}` });

const empty = (): SetlistTree => ({
  setlist: { id: 's', bandId: 'b', createdAt: 1, updatedAt: 1, title: 'Live', venue: '', notes: '', archived: false },
  blocks: [],
  items: [],
});

/** Two blocks: A = [a1 a2 a3], B = [b1]. */
function sample(): SetlistTree {
  let t = empty();
  t = addBlock(t, ctx(), 'A');
  t = addBlock(t, ctx(), 'B');
  const [A, B] = sortedBlocks(t) as unknown as [{ id: string }, { id: string }];
  for (const s of ['a1', 'a2', 'a3']) t = addItem(t, ctx(), A.id, s);
  t = addItem(t, ctx(), B.id, 'b1');
  return t;
}
const names = (t: SetlistTree, blockId: string) => itemsOfBlock(t, blockId).map((i) => i.songId);

describe('blocks', () => {
  it('adds blocks in order, renames, moves and removes (with their items)', () => {
    let t = sample();
    const [A, B] = sortedBlocks(t) as unknown as [{ id: string }, { id: string }];
    expect(sortedBlocks(t).map((b) => b.name)).toEqual(['A', 'B']);

    t = updateBlock(t, ctx(5), A.id, { name: 'Opening', subtitle: 'warm up' });
    expect(sortedBlocks(t)[0]).toMatchObject({ name: 'Opening', subtitle: 'warm up', updatedAt: 5 });

    t = moveBlock(t, ctx(), B.id, 0);
    expect(sortedBlocks(t).map((b) => b.id)).toEqual([B.id, A.id]);
    expect(moveBlock(t, ctx(), B.id, 0)).toBe(t); // already there

    t = removeBlock(t, A.id);
    expect(t.blocks).toHaveLength(1);
    expect(t.items.map((i) => i.songId)).toEqual(['b1']);
  });
});

describe('items', () => {
  it('adds at the end or at an index', () => {
    let t = sample();
    const [A] = sortedBlocks(t) as unknown as [{ id: string }];
    t = addItem(t, ctx(), A.id, 'new', 1);
    expect(names(t, A.id)).toEqual(['a1', 'new', 'a2', 'a3']);
  });

  it('reorders inside a block (final index semantics)', () => {
    let t = sample();
    const [A] = sortedBlocks(t) as unknown as [{ id: string }];
    const a1 = itemsOfBlock(t, A.id)[0]!;
    t = moveItem(t, ctx(), a1.id, A.id, 2);
    expect(names(t, A.id)).toEqual(['a2', 'a3', 'a1']);
    const a3 = itemsOfBlock(t, A.id)[1]!;
    t = moveItem(t, ctx(), a3.id, A.id, 0);
    expect(names(t, A.id)).toEqual(['a3', 'a2', 'a1']);
  });

  it('does nothing when the item stays where it is', () => {
    const t = sample();
    const [A] = sortedBlocks(t) as unknown as [{ id: string }];
    const a2 = itemsOfBlock(t, A.id)[1]!;
    expect(moveItem(t, ctx(), a2.id, A.id, 1)).toBe(t);
  });

  it('moves between blocks, including into an empty one', () => {
    let t = sample();
    t = addBlock(t, ctx(), 'C');
    const [A, B, C] = sortedBlocks(t) as unknown as [{ id: string }, { id: string }, { id: string }];
    const a2 = itemsOfBlock(t, A.id)[1]!;
    t = moveItem(t, ctx(), a2.id, B.id, 0);
    expect(names(t, A.id)).toEqual(['a1', 'a3']);
    expect(names(t, B.id)).toEqual(['a2', 'b1']);
    expect(t.items.find((i) => i.id === a2.id)?.blockId).toBe(B.id);
    const b1 = itemsOfBlock(t, B.id)[1]!;
    t = moveItem(t, ctx(), b1.id, C.id, 0);
    expect(names(t, C.id)).toEqual(['b1']);
  });

  it('updates and removes an item', () => {
    let t = sample();
    const [A] = sortedBlocks(t) as unknown as [{ id: string }];
    const a1 = itemsOfBlock(t, A.id)[0]!;
    t = updateItem(t, ctx(9), a1.id, { transitionType: 'stop', transitionText: 'Stop', performerIds: ['x'] });
    expect(t.items.find((i) => i.id === a1.id)).toMatchObject({ transitionType: 'stop', updatedAt: 9 });
    t = removeItem(t, a1.id);
    expect(names(t, A.id)).toEqual(['a2', 'a3']);
  });

  it('only touches the records that change', () => {
    const t = sample();
    const [A] = sortedBlocks(t) as unknown as [{ id: string }];
    const a1 = itemsOfBlock(t, A.id)[0]!;
    const moved = moveItem(t, ctx(), a1.id, A.id, 2);
    const diff = diffTree(t, moved);
    expect(diff.upsertItems.map((i) => i.id)).toEqual([a1.id]);
    expect(diff.upsertBlocks).toEqual([]);
    expect(diff.setlist).toBeNull();
  });
});

describe('diffTree', () => {
  it('describes additions, removals and setlist edits, and is reversible', () => {
    const before = sample();
    const [A] = sortedBlocks(before) as unknown as [{ id: string }];
    let after = updateSetlist(before, ctx(7), { title: 'Renamed' });
    after = removeBlock(after, A.id);
    after = addBlock(after, ctx(), 'Z');

    const forward = diffTree(before, after);
    expect(forward.setlist?.title).toBe('Renamed');
    expect(forward.removeBlockIds).toEqual([A.id]);
    expect(forward.removeItemIds).toHaveLength(3);
    expect(forward.upsertBlocks.map((b) => b.name)).toEqual(['Z']);

    const backward = diffTree(after, before);
    expect(backward.setlist?.title).toBe('Live');
    expect(backward.upsertBlocks.map((b) => b.id)).toEqual([A.id]);
    expect(backward.upsertItems).toHaveLength(3);
  });

  it('sees no difference between equal trees', () => {
    const t = sample();
    const diff = diffTree(t, { ...t, items: [...t.items] });
    expect(diff).toEqual({ setlist: null, upsertBlocks: [], removeBlockIds: [], upsertItems: [], removeItemIds: [] });
  });
});

describe('cloneTree', () => {
  it('copies everything with new ids and keeps the order', () => {
    const t = sample();
    const copy = cloneTree(t, ctx(), 'Live (copy)');
    expect(copy.setlist).toMatchObject({ title: 'Live (copy)', archived: false });
    expect(copy.setlist.id).not.toBe(t.setlist.id);
    expect(copy.blocks).toHaveLength(2);
    expect(copy.items).toHaveLength(4);
    const oldIds = new Set([...t.blocks, ...t.items].map((r) => r.id));
    expect([...copy.blocks, ...copy.items].some((r) => oldIds.has(r.id))).toBe(false);
    const [cA] = sortedBlocks(copy) as unknown as [{ id: string }];
    expect(names(copy, cA.id)).toEqual(['a1', 'a2', 'a3']);
    expect(copy.items.every((i) => i.setlistId === copy.setlist.id)).toBe(true);
  });
});

describe('helpers', () => {
  it('compares id sets ignoring order', () => {
    expect(sameIdSet(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameIdSet(['a'], ['a', 'b'])).toBe(false);
  });
  it('formats dates and totals', () => {
    expect(formatDate('2026-10-03', 'en')).toMatch(/3.*2026/);
    expect(formatDate('nope', 'en')).toBe('nope');
    expect(formatTotalDuration(2530)).toBe('42:10');
    expect(formatTotalDuration(3930)).toBe('1:05:30');
  });
});
