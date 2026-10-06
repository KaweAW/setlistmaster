import type { DataStore } from './repository';
import { libraryId } from './librarySongs';

/**
 * The instruments every band starts with. The plain text of a song is always there (it is not an instrument);
 * these add a chart of their own. Ids are derived from band + key (like the library songs), so the same band on
 * two devices never ends up with two "Bass", and one you delete stays deleted. Names are plain data: edit freely.
 */
export const DEFAULT_INSTRUMENTS = [
  { key: 'instrument:lead', en: 'Lead guitar', it: 'Chitarra lead' },
  { key: 'instrument:rhythm', en: 'Rhythm guitar', it: 'Chitarra ritmica' },
  { key: 'instrument:bass', en: 'Bass', it: 'Basso' },
] as const;

/** Suggestions offered when adding an instrument by hand. */
export const INSTRUMENT_SUGGESTIONS = {
  en: ['Piano', 'Keyboards', 'Drums', 'Vocals', 'Acoustic guitar'],
  it: ['Piano', 'Tastiere', 'Batteria', 'Voce', 'Chitarra acustica'],
} as const;

/** The id of a song's part for an instrument: one per pair, the same on every device. */
export function partId(bandId: string, songId: string, instrumentId: string): Promise<string> {
  return libraryId(bandId, `part:${songId}:${instrumentId}`);
}

export async function addDefaultInstruments(store: DataStore, bandId: string, language: 'it' | 'en' = 'en'): Promise<void> {
  for (const [order, def] of DEFAULT_INSTRUMENTS.entries()) {
    const id = await libraryId(bandId, def.key);
    if (await store.instruments.has(id)) continue;
    await store.instruments.create({ id, bandId, name: def[language], order });
  }
}
