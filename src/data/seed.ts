import type { TransitionType } from '../core/types';
import { positionsAfter } from '../core/ordering';
import type { DataStore } from './repository';

type Who = 'one' | 'two' | 'backing';
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
  one: { name: 'Singer 1', color: '#C4245C', symbol: '♪' },
  two: { name: 'Singer 2', color: '#0E7C86', symbol: '★' },
  backing: { name: 'Backing vocals', color: '#6B4BB8', symbol: '∞' },
};

const TUNINGS: Record<TuningKey, { name: string; notes: string; isStandard: boolean }> = {
  standard: { name: 'Standard', notes: 'E A D G B E', isStandard: true },
  dgcfad: { name: 'Whole step down', notes: 'D G C F A D', isStandard: false },
  dadgbe: { name: 'Drop D', notes: 'D A D G B E', isStandard: false },
  dbdgbe: { name: 'D B D G B E', notes: 'D B D G B E', isStandard: false },
};

/** The example setlist every new band starts with. Titles and artists only: no lyrics or chords. */
export const SEED_BLOCKS: SeedBlock[] = [
  { name: 'Block 1', songs: [
    { title: 'Fortunate Son', artist: 'CCR', who: ['one'], tuning: 'dgcfad', tr: 'End of riff → straight into **Get Back**' },
    { title: 'Get Back', artist: 'Beatles', who: ['one', 'backing'], tr: 'Last “Get back” → riff of **Are You Gonna Be My Girl**' },
    { title: 'Are You Gonna Be My Girl', artist: 'Jet', who: ['one'], tr: 'Hard stop → **Gouge Away** starts' },
    { title: 'Gouge Away', artist: 'Pixies', who: ['two'], tr: 'Hard stop and a pause', stop: true },
  ] },
  { name: 'Block 2', songs: [
    { title: 'Have You Ever Seen the Rain', artist: 'CCR', who: ['one'], tr: 'End → **Wish You Were Here**' },
    { title: 'Wish You Were Here', artist: 'Pink Floyd', who: ['two'], tr: 'The usual' },
    { title: 'Heart of Gold', artist: 'Neil Young', who: ['one'], tr: 'Straight into **Where Is My Mind?**' },
    { title: 'Where Is My Mind?', artist: 'Pixies', who: ['two'], tr: 'Last E major → the guitar plays the intro' },
    { title: 'Don’t Let Me Down', artist: 'Beatles', who: ['one', 'backing'], tr: 'End → only the drums stay and lead **gently** to the next' },
    { title: 'Money', artist: 'Pink Floyd', who: ['two', 'one'], note: 'either singer', tr: 'Hard stop, or → straight into **Another Brick pt. 2**' },
    { title: 'Another Brick in the Wall, Pt. 2', artist: 'Pink Floyd', who: ['one', 'backing'], note: 'backing vocals, maybe', tr: 'Hard stop', stop: true },
  ] },
  { name: 'Block 3', songs: [
    { title: 'Bed’s Too Big Without You', artist: 'The Police', who: ['one'], tr: 'Groove → try to link it to **I Put a Spell on You**' },
    { title: 'I Put a Spell on You', artist: 'CCR', who: ['one'], tr: 'End → only the drums stay and lead **gently** to the next' },
    { title: 'Glory Box', artist: 'Portishead', who: ['one'], tr: 'Slowed-down groove, fade out → acoustic part' },
    { title: 'Sparks', artist: 'Coldplay', who: ['one'], tr: 'The guitar takes the final solo, fade out → acoustic part of **The Chain**' },
    { title: 'The Chain', artist: 'Fleetwood Mac', who: ['one', 'two'], tuning: 'dadgbe', tr: 'The guitar takes the final solo into the intro of the next song' },
    { title: 'The Adults Are Talking', artist: 'The Strokes', who: ['one'], tr: 'Hard cut', stop: true },
  ] },
  { name: 'Block 4', songs: [
    { title: 'Creep', artist: 'Radiohead', who: ['one'], tr: 'End → soft start of **Karma Police**' },
    { title: 'Karma Police', artist: 'Radiohead', who: ['one', 'two'], note: 'either singer', tr: 'Fade out' },
    { title: 'There, There', artist: 'Radiohead', who: ['one'], tuning: 'dbdgbe', tr: 'Hard cut', stop: true },
  ] },
  { name: 'Block 5', subtitle: 'slow, atmospheric close', songs: [
    { title: 'Спокойная ночь', artist: 'Кино', who: ['two'], tr: 'End with harmonica → acoustic part of **Lover You Should’ve Come Over**' },
    { title: 'Lover You Should’ve Come Over', artist: 'Jeff Buckley', who: ['one'], tr: 'Closing song', stop: true },
  ] },
];

/** Writes performers, tunings, songs and the "Example setlist" setlist for the given band. */
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
    bandId, title: 'Example setlist', venue: '', notes: '', archived: false,
  });
  const blockPositions = positionsAfter(null, SEED_BLOCKS.length);

  for (const [bi, seedBlock] of SEED_BLOCKS.entries()) {
    const block = await store.blocks.create({
      bandId,
      setlistId: setlist.id,
      name: seedBlock.name,
      subtitle: seedBlock.subtitle ?? '',
      reserve: false,
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
