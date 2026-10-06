import type { TransitionType } from '../core/types';
import { positionsAfter } from '../core/ordering';
import type { DataStore } from './repository';

type Who = 'julie' | 'kawe' | 'coro';
type TuningKey = 'standard' | 'dgcfad' | 'dadgbe' | 'dbdgbe';

interface SeedSong {
  title: string;
  artist: string;
  who: Who[];
  tuning?: TuningKey;
  note?: string;
  /** "**x**" = bold. */
  tr: string;
  stop?: true;
}
interface SeedBlock {
  name: string;
  subtitle?: string;
  songs: SeedSong[];
}

const PERFORMERS: Record<Who, { name: string; color: string; symbol: string }> = {
  julie: { name: 'Julie', color: '#C4245C', symbol: '♀' },
  kawe: { name: 'Kawe', color: '#0E7C86', symbol: '♂' },
  coro: { name: 'Coro', color: '#6B4BB8', symbol: '∞' },
};

const TUNINGS: Record<TuningKey, { name: string; notes: string; isStandard: boolean }> = {
  standard: { name: 'Standard (E A D G B E)', notes: 'E A D G B E', isStandard: true },
  dgcfad: { name: 'D-G-C-F-A-D', notes: 'D-G-C-F-A-D', isStandard: false },
  dadgbe: { name: 'Drop D', notes: 'D A D G B E', isStandard: false },
  dbdgbe: { name: 'D B D G B E', notes: 'D B D G B E', isStandard: false },
};

/** Setlist from the prototype (brief, section 10). Titles and artists only: no lyrics or chords. */
export const SEED_BLOCKS: SeedBlock[] = [
  { name: 'Blocco 1', songs: [
    { title: 'Fortunate Son', artist: 'CCR', who: ['julie'], tuning: 'dgcfad', tr: 'Fine riff → attacco diretto di **Get Back** (sempre se mi accordassi in tempo)' },
    { title: 'Get Back', artist: 'Beatles', who: ['julie', 'coro'], tr: 'Ultimo “Get back” → riff di **Are You Gonna Be My Girl**' },
    { title: 'Are You Gonna Be My Girl', artist: 'Jet', who: ['julie'], tr: 'Stop netto → attacco di **Gouge Away**' },
    { title: 'Gouge Away', artist: 'Pixies', who: ['kawe'], tr: 'Stop netto e pausa', stop: true },
  ] },
  { name: 'Blocco 2', songs: [
    { title: 'Have You Ever Seen the Rain', artist: 'CCR', who: ['julie'], tr: 'Fine → **Wish You Were Here**' },
    { title: 'Wish You Were Here', artist: 'Pink Floyd', who: ['kawe'], tr: 'La solita' },
    { title: 'Heart of Gold', artist: 'Neil Young', who: ['julie'], tr: 'Attacco subito di **Where Is My Mind?**' },
    { title: 'Where Is My Mind?', artist: 'Pixies', who: ['kawe'], tr: 'Ultimo Mi maggiore → intro fatta da Alex' },
    { title: 'Don’t Let Me Down', artist: 'Beatles', who: ['julie', 'coro'], tr: 'Fine → rimane solo batteria che porta **dolcemente** alla prossima' },
    { title: 'Money', artist: 'Pink Floyd', who: ['kawe', 'julie'], note: 'io o lei', tr: 'Stop netto oppure → attacco di **Another Brick pt. 2**' },
    { title: 'Another Brick in the Wall, Pt. 2', artist: 'Pink Floyd', who: ['julie', 'coro'], note: 'coro forse', tr: 'Stop netto', stop: true },
  ] },
  { name: 'Blocco 3', songs: [
    { title: 'Bed’s Too Big Without You', artist: 'The Police', who: ['julie'], tr: 'Groove → si cerca di collegarla a **I Put a Spell on You**' },
    { title: 'I Put a Spell on You', artist: 'CCR', who: ['julie'], tr: 'Fine → rimane solo batteria che porta **dolcemente** alla prossima' },
    { title: 'Glory Box', artist: 'Portishead', who: ['julie'], tr: 'Groove rallentato in fade out → parte acustica' },
    { title: 'Sparks', artist: 'Coldplay', who: ['julie'], tr: 'Alex porta il solo finale in fade out → parte acustica di **The Chain**' },
    { title: 'The Chain', artist: 'Fleetwood Mac', who: ['julie', 'kawe'], tuning: 'dadgbe', tr: 'Alex porta il solo finale a un’intro della prossima canzone' },
    { title: 'The Adults Are Talking', artist: 'The Strokes', who: ['julie'], tr: 'Stacco netto', stop: true },
  ] },
  { name: 'Blocco 4', songs: [
    { title: 'Creep', artist: 'Radiohead', who: ['julie'], tr: 'Fine → attacco soft di **Karma Police**' },
    { title: 'Karma Police', artist: 'Radiohead', who: ['julie', 'kawe'], note: 'lei o io', tr: 'Fade out' },
    { title: 'There, There', artist: 'Radiohead', who: ['julie'], tuning: 'dbdgbe', tr: 'Stacco netto', stop: true },
  ] },
  { name: 'Blocco 5', subtitle: 'chiusura emotiva e atmosferica', songs: [
    { title: 'Спокойная ночь', artist: 'Кино', who: ['kawe'], tr: 'Fine con armoniche di Alex → parte acustica di **Lover You Should’ve Come Over**' },
    { title: 'Lover You Should’ve Come Over', artist: 'Jeff Buckley', who: ['julie'], tr: 'Chiusura', stop: true },
  ] },
];

/** Writes performers, tunings, songs and the "Scaletta live" setlist for the given band. */
export async function seedBand(store: DataStore, bandId: string): Promise<void> {
  const performerId = {} as Record<Who, string>;
  for (const key of Object.keys(PERFORMERS) as Who[]) {
    performerId[key] = (await store.performers.create({ bandId, ...PERFORMERS[key] })).id;
  }
  const tuningId = {} as Record<TuningKey, string>;
  for (const key of Object.keys(TUNINGS) as TuningKey[]) {
    tuningId[key] = (await store.tunings.create({ bandId, ...TUNINGS[key] })).id;
  }

  const setlist = await store.setlists.create({
    bandId, title: 'Scaletta live', venue: '', notes: '', archived: false,
  });
  const blockPositions = positionsAfter(null, SEED_BLOCKS.length);

  for (const [bi, seedBlock] of SEED_BLOCKS.entries()) {
    const block = await store.blocks.create({
      bandId,
      setlistId: setlist.id,
      name: seedBlock.name,
      subtitle: seedBlock.subtitle ?? '',
      position: blockPositions[bi]!,
    });
    const itemPositions = positionsAfter(null, seedBlock.songs.length);
    for (const [si, seedSong] of seedBlock.songs.entries()) {
      const performerIds = seedSong.who.map((w) => performerId[w]);
      const song = await store.songs.create({
        bandId,
        title: seedSong.title,
        artist: seedSong.artist,
        capo: 0,
        tuningId: tuningId[seedSong.tuning ?? 'standard'],
        defaultPerformerIds: performerIds, instrumentIds: [],
        chordpro: '',
        notes: '',
        tags: [],
      });
      const transitionType: TransitionType = seedSong.stop ? 'stop' : 'segue';
      await store.items.create({
        bandId,
        setlistId: setlist.id,
        blockId: block.id,
        songId: song.id,
        position: itemPositions[si]!,
        performerIds,
        performerNote: seedSong.note ?? '',
        transitionType,
        transitionText: seedSong.tr,
        notes: '',
      });
    }
  }
}
