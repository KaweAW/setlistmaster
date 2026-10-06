import { parseTuningNotes } from '../core/tuning';
import type { Tuning } from '../core/types';
import { useT } from '../i18n';

/**
 * How a non-standard tuning is shown: an amber pill with the notes from the lowest string to the
 * highest, separated by thin dots ("D · G · C · F · A · D"), followed by the ♭ square of the prototype.
 * Free text that is not a list of notes (e.g. "open G") is shown as it is.
 */
export function TuningChip({ tuning, withFlat = true }: { tuning: Tuning; withFlat?: boolean }) {
  const t = useT();
  const text = tuning.notes.trim() || tuning.name;
  const notes = parseTuningNotes(text);
  return (
    <span className="inline-flex items-center gap-1" title={`${t('tuning.different')}: ${tuning.name}`}>
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-acc-tint px-2 py-[3px] font-display text-[12px] font-bold leading-none text-acc-ink">
        {notes
          ? notes.map((note, i) => (
              <span key={i} className="inline-flex items-center">
                {i > 0 && <span aria-hidden className="mx-[3px] text-[8px] text-acc">●</span>}
                <span className="min-w-[0.7em] text-center">{note}</span>
              </span>
            ))
          : text}
      </span>
      {withFlat && (
        <i className="grid h-[23px] w-[23px] place-items-center rounded-[3px] bg-acc text-[15px] font-semibold not-italic leading-none text-white">
          ♭
        </i>
      )}
    </span>
  );
}
