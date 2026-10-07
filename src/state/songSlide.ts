/** Which way the next song comes in when moving along a setlist: remembered by whoever changes the song, read by the new page. */
export type SongSlide = 'left' | 'right';
let from: SongSlide | null = null;
export const rememberSongSlide = (d: SongSlide) => { from = d; };
export const peekSongSlide = (): SongSlide | null => from;
export const clearSongSlide = () => { from = null; };
