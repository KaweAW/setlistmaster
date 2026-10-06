import { useEffect } from 'react';
import { useIsDark } from '../state/uiStore';

/** Applies the dark theme to the whole page (see the colour tokens in index.css) and to the browser's address-bar colour. */
export function ThemeSync() {
  const dark = useIsDark();
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0F1220' : '#1B2038');
  }, [dark]);
  return null;
}
