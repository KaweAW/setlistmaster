// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Modal } from '../Modal';
import { Select } from '../Select';

afterEach(cleanup);

const FRUIT = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry' },
];

function Harness({ options = FRUIT, onPick }: { options?: typeof FRUIT; onPick?: (v: string) => void }) {
  const [v, setV] = useState('a');
  return <Select label="Fruit" value={v} options={options} onChange={(x) => { setV(x); onPick?.(x); }} />;
}
const trigger = () => screen.getByRole('combobox', { name: 'Fruit' });

describe('Select', () => {
  it('shows the chosen label, opens a listbox and picks with a click', async () => {
    const pick = vi.fn();
    render(<Harness onPick={pick} />);
    expect(trigger().textContent).toContain('Apple');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger());
    const list = await screen.findByRole('listbox', { name: 'Fruit' });
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect([...list.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual(['Apple', 'Banana', 'Cherry']);
    expect(list.querySelector('[aria-selected="true"]')!.textContent).toBe('Apple');
    fireEvent.click(screen.getByRole('option', { name: 'Cherry' }));
    expect(pick).toHaveBeenCalledWith('c');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(trigger().textContent).toContain('Cherry');
  });

  it('works from the keyboard: arrows, Enter, Escape, and typing to jump', async () => {
    const pick = vi.fn();
    render(<Harness onPick={pick} />);
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    const panel = (await screen.findByRole('listbox')).parentElement!;
    fireEvent.keyDown(panel, { key: 'ArrowDown' });
    fireEvent.keyDown(panel, { key: 'Enter' });
    expect(pick).toHaveBeenLastCalledWith('b');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());

    fireEvent.keyDown(trigger(), { key: 'ArrowUp' });
    const again = (await screen.findByRole('listbox')).parentElement!;
    fireEvent.keyDown(again, { key: 'c' }); // type-ahead
    fireEvent.keyDown(again, { key: 'Enter' });
    expect(pick).toHaveBeenLastCalledWith('c');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());

    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    fireEvent.keyDown((await screen.findByRole('listbox')).parentElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(pick).toHaveBeenCalledTimes(2); // Escape chooses nothing
  });

  it('does not report a pick of the value it already has', async () => {
    const pick = vi.fn();
    render(<Harness onPick={pick} />);
    fireEvent.click(trigger());
    fireEvent.click(await screen.findByRole('option', { name: 'Apple' }));
    expect(pick).not.toHaveBeenCalled();
  });

  it('adds a search box to long lists and filters by it', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ value: `v${i}`, label: i === 7 ? 'Zebra' : `Item ${i}` }));
    render(<Harness options={many} />);
    fireEvent.click(trigger());
    const search = await screen.findByPlaceholderText('Search…');
    fireEvent.change(search, { target: { value: 'zeb' } });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Zebra']);
    fireEvent.change(search, { target: { value: 'nothing' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('Nothing found')).toBeTruthy();
  });

  it('has no search box on a short list', async () => {
    render(<Harness />);
    fireEvent.click(trigger());
    await screen.findByRole('listbox');
    expect(screen.queryByPlaceholderText('Search…')).toBeNull();
  });

  it('closes on Escape without closing the dialog it sits in', async () => {
    const onClose = vi.fn();
    render(<Modal title="Edit" onClose={onClose}><Harness /></Modal>);
    fireEvent.click(trigger());
    fireEvent.keyDown((await screen.findByRole('listbox')).parentElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
  });
});
