// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from '../../routes';
import { createDexieStore } from '../../data/dexie/dexieRepository';
import { bootstrap } from '../../data/bootstrap';
import { DataProvider } from '../../data/DataProvider';

let n = 0;
async function setup(path: string) {
  const store = createDexieStore({ dbName: `ui3-${++n}` });
  const band = await bootstrap(store);
  const setlist = (await store.setlists.listBy('bandId', band.id))[0]!;
  render(
    <MemoryRouter initialEntries={[path.replace(':id', setlist.id)]}>
      <DataProvider store={store}>
        <AppRoutes />
      </DataProvider>
    </MemoryRouter>,
  );
  return { store, setlist };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PDF export', () => {
  it('offers Export PDF from the clean setlist view only', async () => {
    await setup('/setlist/:id');
    await screen.findByRole('heading', { name: 'Example setlist' });
    expect(screen.getByRole('link', { name: 'Export PDF' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByRole('link', { name: 'Export PDF' })).toBeNull();
  });

  it('shows every song exactly once on the pages, with the computed legend, and prints on demand', async () => {
    await setup('/setlist/:id/print');
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    await waitFor(() => expect(document.querySelectorAll('.pp-page').length).toBeGreaterThan(0));

    const rows = document.querySelectorAll('.pp-page [data-row]');
    expect(rows).toHaveLength(22);
    const titles = [...rows].map((r) => r.textContent ?? '');
    expect(titles.filter((x) => x.includes('Fortunate Son'))).toHaveLength(1);
    expect(titles.filter((x) => x.includes('Спокойная ночь'))).toHaveLength(1);

    // header and legend only once, on the first page, and no app navigation
    const pages = document.querySelectorAll('.pp-page');
    expect(pages[0]!.querySelector('h1')?.textContent).toBe('Example setlist');
    expect(document.querySelectorAll('.pp-page h1')).toHaveLength(1);
    expect(pages[0]!.textContent).toContain('Different tuning');
    expect(pages[0]!.textContent).toContain('Hard stop');
    expect(screen.queryByRole('link', { name: 'Library' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Print / Save as PDF' }));
    expect(print).toHaveBeenCalledOnce();
  });

  it('uses the setlist title as the document title (default PDF file name)', async () => {
    await setup('/setlist/:id/print');
    await waitFor(() => expect(document.title).toBe('Example setlist'));
  });
});
