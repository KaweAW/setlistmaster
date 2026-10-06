import { useDataRevision } from '../state/dataRevision';

/**
 * A soft highlight that plays once over a row when a bandmate has just changed it. Put it inside a `relative` parent;
 * it never takes a tap (pointer-events none) and does nothing for people who asked for less motion (see index.css).
 */
export function RemoteFlash({ id }: { id: string }) {
  const at = useDataRevision((s) => s.flashed[id]);
  if (at === undefined) return null;
  return <span key={at} aria-hidden className="remote-flash pointer-events-none absolute inset-0 rounded-[inherit]" />;
}
