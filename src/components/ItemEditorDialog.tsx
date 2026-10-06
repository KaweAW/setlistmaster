import { useState } from 'react';
import { sameIdSet, type ItemPatch } from '../core/setlistOps';
import { formatTuningNotes } from '../core/tuning';
import type { Performer, SetlistItem, Song, Tuning, TransitionType } from '../core/types';
import { useT } from '../i18n';
import { Modal } from './Modal';
import { PerformerBadge } from './PerformerBadge';
import { Button, Field, FieldGroup, inputClass, textareaClass } from './ui';

/** Edit how a song is played in this setlist. Applied as ONE change (one undo step) when saved. */
export function ItemEditorDialog({
  item,
  song,
  performers,
  tunings,
  onSave,
  onRemove,
  onClose,
}: {
  item: SetlistItem;
  song: Song;
  performers: Performer[];
  tunings: Tuning[];
  onSave: (patch: ItemPatch) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const [selected, setSelected] = useState(item.performerIds.length > 0 ? item.performerIds : song.defaultPerformerIds);
  const [performerNote, setPerformerNote] = useState(item.performerNote);
  const [tuningOverrideId, setTuningOverrideId] = useState(item.tuningOverrideId ?? '');
  const [transitionType, setTransitionType] = useState<TransitionType>(item.transitionType);
  const [transitionText, setTransitionText] = useState(item.transitionText);
  const [notes, setNotes] = useState(item.notes);

  const songTuning = tunings.find((x) => x.id === song.tuningId);
  const transitions: { type: TransitionType; label: string }[] = [
    { type: 'segue', label: `↳ ${t('transition.segue')}` },
    { type: 'stop', label: `■ ${t('transition.stop')}` },
    { type: 'none', label: t('transition.none') },
  ];

  function save() {
    onSave({
      // Same singers as the song's defaults = keep inheriting them.
      performerIds: sameIdSet(selected, song.defaultPerformerIds) ? [] : selected,
      performerNote: performerNote.trim(),
      tuningOverrideId: tuningOverrideId || undefined,
      transitionType,
      transitionText: transitionType === 'none' ? '' : transitionText,
      notes,
    });
  }

  return (
    <Modal title={song.title} onClose={onClose}>
      <div className="space-y-4">
        <FieldGroup legend={t('item.performers')}>
          <div className="flex flex-wrap gap-2">
            {performers.map((p) => {
              const on = selected.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSelected(on ? selected.filter((x) => x !== p.id) : [...selected, p.id])}
                  className={`flex h-11 items-center gap-2 rounded-full border px-3 text-base font-semibold ${
                    on ? 'border-ink bg-ink text-paper' : 'border-line bg-surface text-ink'
                  }`}
                >
                  <PerformerBadge performer={p} size={22} />
                  {p.name}
                </button>
              );
            })}
          </div>
        </FieldGroup>

        <Field label={t('item.performerNote')}>
          <input className={inputClass} value={performerNote} onChange={(e) => setPerformerNote(e.target.value)} />
        </Field>

        <Field label={t('item.tuning')}>
          <select className={inputClass} value={tuningOverrideId} onChange={(e) => setTuningOverrideId(e.target.value)}>
            <option value="">
              {t('item.tuningDefault', { name: songTuning ? songTuning.name : '—' })}
            </option>
            {tunings.map((x) => (
              <option key={x.id} value={x.id}>
                {x.isStandard || !x.notes ? x.name : `${x.name} — ${formatTuningNotes(x.notes)}`}
              </option>
            ))}
          </select>
        </Field>

        <FieldGroup legend={t('item.transition')}>
          <div className="flex flex-wrap gap-2">
            {transitions.map((tr) => (
              <button
                key={tr.type}
                type="button"
                aria-pressed={transitionType === tr.type}
                onClick={() => setTransitionType(tr.type)}
                className={`h-11 rounded-full border px-3 text-base font-semibold ${
                  transitionType === tr.type ? 'border-ink bg-ink text-paper' : 'border-line bg-surface text-ink'
                }`}
              >
                {tr.label}
              </button>
            ))}
          </div>
        </FieldGroup>

        {transitionType !== 'none' && (
          <Field label={t('item.transitionText')} hint={t('item.transitionHint')}>
            <input className={inputClass} value={transitionText} onChange={(e) => setTransitionText(e.target.value)} />
          </Field>
        )}

        <Field label={t('field.notes')}>
          <textarea className={textareaClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <div className="flex flex-wrap gap-3 pt-1">
          <Button onClick={save}>{t('common.done')}</Button>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="danger" className="ml-auto" onClick={onRemove}>{t('item.removeFromSetlist')}</Button>
        </div>
      </div>
    </Modal>
  );
}
