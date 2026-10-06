import { useEffect, useState } from 'react';

export type WakeLockStatus = 'inactive' | 'pending' | 'active' | 'denied' | 'unsupported';

/**
 * Keeps the screen on while `enabled` (Screen Wake Lock API). The browser drops the lock whenever the page is
 * hidden, so it is taken again when the app comes back to the foreground.
 */
export function useWakeLock(enabled: boolean): WakeLockStatus {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [held, setHeld] = useState<'pending' | 'active' | 'denied'>('pending');

  useEffect(() => {
    if (!enabled || !supported) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel = lock;
        setHeld('active');
        lock.addEventListener('release', () => {
          if (sentinel === lock) {
            sentinel = null;
            setHeld('pending');
          }
        });
      } catch {
        if (!cancelled) setHeld('denied');
      }
    };

    void acquire();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !sentinel) void acquire();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
      sentinel = null;
    };
  }, [enabled, supported]);

  if (!enabled) return 'inactive';
  if (!supported) return 'unsupported';
  return held;
}
