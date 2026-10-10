/**
 * Height of a printed page, in millimetres.
 *
 * Most browsers honour `@page { size: A4; margin: 0 }`, so the page is the whole 297 mm sheet. iPhone and iPad (every browser
 * on iOS is WebKit) ignore the zero margin: they shrink the page to fit the width and keep room for their own header and
 * footer (address and date). A 297 mm page then no longer fits the printable area and spills a few millimetres onto an extra,
 * almost empty sheet after every page. A shorter page fits.
 */
export const A4_HEIGHT_MM = 297;
export const IOS_PAGE_HEIGHT_MM = 280;

export function isIos(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & { platform?: string }): boolean {
  if (/iPad|iPhone|iPod/.test(nav.userAgent)) return true;
  // iPadOS announces itself as a Mac, but has a touch screen.
  return nav.platform === 'MacIntel' && nav.maxTouchPoints > 1;
}

export function pageHeightMm(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & { platform?: string } = navigator): number {
  return isIos(nav) ? IOS_PAGE_HEIGHT_MM : A4_HEIGHT_MM;
}
