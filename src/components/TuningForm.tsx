import { useState, type FormEvent } from 'react';
import { useT } from '../i18n';
import { Button, Field, inputClass } from './ui';

export interface TuningValues {
  name: string;
  notes: string;
}

/** Inline form to create or rename a tuning. Used in Settings and in the song form ("create on the fly"). */
export function TuningForm({
  initial,
  title,
  onSubmit,
  onCancel,
}: {
  initial?: TuningValues;
  title?: string;
  onSubmit: (values: TuningValues) => void | Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation(); // may be nested inside the song form
    if (!name.trim()) {
      setError(true);
      return;
    }
    void onSubmit({ name: name.trim(), notes: notes.trim() });
  }

  return (
    <div className="space-y-3 rounded-md border border-line bg-surface p-3">
      {title && <h3 className="font-display text-lg font-bold uppercase tracking-wide">{title}</h3>}
      <Field label={t('tuning.name')} error={error ? t('validation.required') : undefined}>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t('tuning.notes')}>
        <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button onClick={submit}>{t('common.save')}</Button>
        <Button variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
