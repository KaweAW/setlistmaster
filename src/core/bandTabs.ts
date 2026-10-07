import type { Band } from './types';

export interface BandGroups {
  /** A band that lives only on this device (the oldest of them). */
  personal: Band | undefined;
  /** Bands shared through the cloud (created here and shared, or joined), oldest first. */
  shared: Band[];
}

/**
 * Splits the bands of a device into the two home tabs: the oldest band that is not shared is the "personal" one, the
 * others (created here and shared, or joined) are the shared ones. If every band is shared the home creates a personal one.
 */
export function groupBands(bands: readonly Band[], linked: ReadonlySet<string>): BandGroups {
  const sorted = [...bands].sort((a, b) => a.createdAt - b.createdAt);
  const personal = sorted.find((b) => !linked.has(b.id));
  return { personal, shared: sorted.filter((b) => linked.has(b.id)) };
}
