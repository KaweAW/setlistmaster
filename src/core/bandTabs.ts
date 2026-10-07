import type { Band } from './types';

export interface BandGroups {
  /** The device's own band, while it is still only on this device. */
  personal: Band | undefined;
  /** Bands shared through the cloud (created here and shared, or joined), oldest first. */
  shared: Band[];
}

/**
 * Splits the bands of a device into the two home tabs. The oldest band is the device's own; as long as it is not shared it is
 * the "personal" tab. Once it is shared it moves among the shared bands, and the personal tab disappears.
 */
export function groupBands(bands: readonly Band[], linked: ReadonlySet<string>): BandGroups {
  const sorted = [...bands].sort((a, b) => a.createdAt - b.createdAt);
  const own = sorted[0];
  const personal = own && !linked.has(own.id) ? own : undefined;
  return { personal, shared: sorted.filter((b) => linked.has(b.id)) };
}
