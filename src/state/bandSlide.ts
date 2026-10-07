/** Which way the home content should come in after a band change: remembered here by whoever changes the band. */
export type SlideFrom = 'left' | 'right';
let from: SlideFrom | null = null;
export const rememberSlide = (direction: SlideFrom) => { from = direction; };
/** Read while rendering (can run twice), so reading does not clear it; the home clears it once it is on screen. */
export const peekSlide = (): SlideFrom | null => from;
export const clearSlide = () => { from = null; };
