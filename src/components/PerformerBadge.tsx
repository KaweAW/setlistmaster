import type { Performer } from '../core/types';

/** Round badge for a singer; the group symbol (∞) is a rounded square, as in the prototype. */
export function PerformerBadge({ performer, size = 23 }: { performer: Performer; size?: number }) {
  const shape = performer.symbol === '∞' ? 'rounded-md' : 'rounded-full';
  return (
    <i
      className={`grid shrink-0 place-items-center font-bold not-italic leading-none text-white ${shape}`}
      style={{ background: performer.color, width: size, height: size, fontSize: Math.round(size * 0.6) }}
      title={performer.name}
    >
      {performer.symbol}
    </i>
  );
}
