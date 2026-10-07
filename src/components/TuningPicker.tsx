import { useT } from '../i18n';
import {
  EXTRA_LOW_STRINGS,
  MAX_STRINGS,
  STANDARD_STRINGS,
  TUNING_NOTES,
  isStandardStrings,
  nameForStrings,
  standardStrings,
} from '../core/tuning';
import { Select } from './Select';

const OPTIONS = TUNING_NOTES.map((n) => ({ value: n, label: n }));

/**
 * The tuning of a song as one box per string, lowest string on the left. Each box is a menu of the twelve notes, so nothing
 * is typed; extra low strings can be added for 7- and 8-string guitars. A new choice always starts from standard tuning.
 */
export function TuningPicker({ strings, onChange }: { strings: readonly string[]; onChange: (strings: string[]) => void }) {
  const t = useT();
  const standard = isStandardStrings(strings);
  const extra = strings.length - STANDARD_STRINGS.length;
  return (
    <div className="rounded-lg border border-line bg-paper/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-lg font-bold uppercase tracking-wide">{nameForStrings(strings)}</span>
        {!standard && (
          <button type="button" className="h-9 px-1 text-sm font-semibold text-io" onClick={() => onChange(standardStrings())}>
            {t('tuning.reset')}
          </button>
        )}
      </div>
      <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${strings.length}, minmax(0, 1fr))` }}>
        {strings.map((note, i) => {
          const number = strings.length - i;
          return (
            <div key={i} className="min-w-0">
              <div className="mb-0.5 text-center text-[11px] font-semibold text-soft">{number}</div>
              <Select
                variant="string"
                label={t('tuning.string', { n: number })}
                value={note}
                options={OPTIONS}
                searchAbove={99}
                onChange={(v) => onChange(strings.map((x, j) => (j === i ? v : x)))}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        {strings.length < MAX_STRINGS && (
          <button
            type="button"
            className="h-9 rounded-md border border-dashed border-line px-3 text-sm font-semibold text-soft transition-colors hover:border-io/60"
            onClick={() => onChange([EXTRA_LOW_STRINGS[extra]!, ...strings])}
          >
            {t('tuning.addString')}
          </button>
        )}
        {extra > 0 && (
          <button
            type="button"
            className="h-9 rounded-md border border-dashed border-line px-3 text-sm font-semibold text-soft transition-colors hover:border-io/60"
            onClick={() => onChange(strings.slice(1))}
          >
            {t('tuning.removeString')}
          </button>
        )}
      </div>
    </div>
  );
}
