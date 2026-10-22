// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from '../../routes';
import { createDexieStore } from '../../data/dexie/dexieRepository';
import { bootstrap } from '../../data/bootstrap';
import { DataProvider } from '../../data/DataProvider';
import { useUiStore } from '../../state/uiStore';

vi.mock('../../components/PdfViewer', () => ({ default: () => null }));
beforeAll(async () => {
  await import('../SongPage');
}, 60_000);

// The layout Cifra reads: fingerings on top, headings in brackets, chords on their own line above the words.
const TEXT = [
  'F#m    244222',
  'C#     x46664',
  '',
  '[Bass Intro x4]',
  'F#m C#  x4',
  '',
  '[Verse 1]',
  'F#m       C#',
  '   I am a patient boy',
  'E',
  'I wait',
].join('\n');

let n = 0;
async function open() {
  const store = createDexieStore({ dbName: `dg-${++n}` });
  const band = await bootstrap(store);
  const song = (await store.songs.listBy('bandId', band.id))[0]!;
  await store.songs.update(song.id, { chordpro: TEXT, key: '', capo: 0 });
  render(
    <MemoryRouter initialEntries={[`/song/${song.id}`]}>
      <DataProvider store={store}><AppRoutes /></DataProvider>
    </MemoryRouter>,
  );
  return song;
}

afterEach(cleanup);

describe('chord diagrams on the song page', () => {
  it('shows the written fingerings and a ready-made one for the other chords, and the sharps survive', async () => {
    useUiStore.setState({ showDiagrams: true, stageMode: false });
    await open();
    const strip = await screen.findByRole('list', { name: 'Chord diagrams' });
    expect(within(strip).getAllByRole('listitem').map((b) => b.getAttribute('data-chord'))).toEqual(['F#m', 'C#', 'E']);
    expect(within(strip).getByTitle('F#m 244222')).toBeTruthy();
    expect(within(strip).getByTitle('E 022100')).toBeTruthy(); // not written: the common open E
    expect(document.querySelector('.chart')!.textContent).not.toContain('244222'); // fingering lines are not lyrics
  });

  it('shows a chord large when it is tapped in the text', async () => {
    useUiStore.setState({ showDiagrams: false, stageMode: false });
    await open();
    expect(screen.queryByRole('list', { name: 'Chord diagrams' })).toBeNull();
    const chord = (await screen.findAllByRole('button', { name: 'C#' }))[0]!;
    fireEvent.click(chord);
    const dock = await screen.findByRole('dialog', { name: 'C#' });
    expect(within(dock).getByText('x46664')).toBeTruthy();
    expect(within(dock).getByText('Fingering from the text')).toBeTruthy();
  });
});
