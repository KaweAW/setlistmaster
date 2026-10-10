import { describe, expect, it } from 'vitest';
import { A4_HEIGHT_MM, IOS_PAGE_HEIGHT_MM, pageHeightMm } from '../sheet';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

describe('pageHeightMm', () => {
  it('keeps the full A4 sheet on desktop browsers', () => {
    expect(pageHeightMm({ userAgent: MAC, maxTouchPoints: 0, platform: 'MacIntel' })).toBe(A4_HEIGHT_MM);
  });
  it('uses a shorter page on iPhone and on iPad (which calls itself a Mac)', () => {
    expect(pageHeightMm({ userAgent: IPHONE, maxTouchPoints: 5, platform: 'iPhone' })).toBe(IOS_PAGE_HEIGHT_MM);
    expect(pageHeightMm({ userAgent: MAC, maxTouchPoints: 5, platform: 'MacIntel' })).toBe(IOS_PAGE_HEIGHT_MM);
  });
});
