import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, createHistory, pushHistory, redoHistory, undoHistory } from '../history';

describe('history', () => {
  it('undoes and redoes', () => {
    let h = createHistory(1);
    h = pushHistory(h, 2);
    h = pushHistory(h, 3);
    expect(h.present).toBe(3);
    h = undoHistory(h);
    expect(h.present).toBe(2);
    h = undoHistory(h);
    expect(h.present).toBe(1);
    expect(canUndo(h)).toBe(false);
    h = redoHistory(h);
    expect(h.present).toBe(2);
    expect(canRedo(h)).toBe(true);
  });

  it('drops the redo branch on a new change', () => {
    let h = pushHistory(pushHistory(createHistory('a'), 'b'), 'c');
    h = undoHistory(h);
    h = pushHistory(h, 'd');
    expect(canRedo(h)).toBe(false);
    expect(h.present).toBe('d');
  });

  it('ignores a push of the same value, and no-op undo/redo', () => {
    const h = createHistory({ x: 1 });
    expect(pushHistory(h, h.present)).toBe(h);
    expect(undoHistory(h)).toBe(h);
    expect(redoHistory(h)).toBe(h);
  });

  it('keeps at most `limit` steps', () => {
    let h = createHistory(0);
    for (let i = 1; i <= 5; i++) h = pushHistory(h, i, 3);
    expect(h.past).toEqual([2, 3, 4]);
  });
});
