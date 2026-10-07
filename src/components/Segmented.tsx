import { useT } from '../i18n';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Two or three exclusive choices in one pill; a highlight slides from one to the other instead of the colour jumping.
 * Each option stays a real button (`aria-pressed`), so keyboards and screen readers work as for any toggle.
 */
export function Segmented<T extends string>({
  value, options, onChange, className = '', label,
}: {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (v: T) => void;
  className?: string;
  label?: string;
}) {
  useT();
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <span role="group" aria-label={label} className={`segmented relative inline-grid rounded-lg border border-line bg-surface p-0.5 ${className}`} style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      <span
        aria-hidden
        className="segmented-thumb absolute inset-y-0.5 left-0.5 rounded-md bg-ink"
        style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`relative z-10 h-10 px-4 text-sm font-semibold transition-colors duration-200 ${value === o.value ? 'text-paper' : 'text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}
