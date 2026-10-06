import { useState } from 'react';
import { useT } from '../i18n';
import { Button, Field, inputClass } from './ui';

export interface PerformerValues {
  name: string;
  symbol: string;
  color: string;
}

const SYMBOLS = ['♀', '♂', '∞', '♪', '★', '●'];

export function PerformerForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: PerformerValues;
  onSubmit: (values: PerformerValues) => void | Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? '');
  const [symbol, setSymbol] = useState(initial?.symbol ?? '♪');
  const [color, setColor] = useState(initial?.color ?? '#0E7C86');
  const [error, setError] = useState(false);

  function submit() {
    if (!name.trim() || !symbol.trim()) {
      setError(true);
      return;
    }
    void onSubmit({ name: name.trim(), symbol: symbol.trim(), color });
  }

  return (
    <div className="space-y-3 rounded-md border border-line bg-surface p-3">
      <Field label={t('performer.name')} error={error && !name.trim() ? t('validation.required') : undefined}>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('performer.symbol')} className="w-28">
          <input
            className={inputClass}
            value={symbol}
            maxLength={2}
            onChange={(e) => setSymbol(e.target.value)}
          />
        </Field>
        <div className="flex gap-1.5 pb-0.5">
          {SYMBOLS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSymbol(s)}
              className="h-11 w-11 rounded-md border border-line bg-surface text-lg hover:bg-paper"
              aria-label={s}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <Field label={t('performer.color')} className="w-28">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-11 w-full cursor-pointer rounded-md border border-line bg-surface p-1"
        />
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
