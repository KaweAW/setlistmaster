import { useState, type FormEvent } from 'react';
import { instrumentUsage } from '../core/usage';
import { INSTRUMENT_SUGGESTIONS } from '../data/instruments';
import { useData } from '../data/DataProvider';
import { useQuery } from '../hooks/useQuery';
import { useT } from '../i18n';
import { useUiStore } from '../state/uiStore';
import { useMyInstrument } from '../cloud/CloudProvider';
import { Button, Field, inputClass } from './ui';

/** Settings: the band's instruments (editable list) and the one I play. */
export function InstrumentsSection({ Title, canEdit = true }: { Title: (p: { children: string }) => JSX.Element; canEdit?: boolean }) {
  const t = useT();
  const language = useUiStore((s) => s.language);
  const { store, band } = useData();
  const mine = useMyInstrument();
  const { data, reload } = useQuery(async () => {
    const [instruments, songs] = await Promise.all([
      store.instruments.listBy('bandId', band.id),
      store.songs.listBy('bandId', band.id),
    ]);
    instruments.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
    return { instruments, songs };
  }, [store, band.id]);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  if (!data) return null;
  const { instruments, songs } = data;

  function open(id: string | 'new', value: string) {
    setEditing(id);
    setName(value);
    setMessage(null);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const value = name.trim();
    if (!value) return setMessage(t('validation.required'));
    if (editing === 'new') {
      const order = instruments.reduce((max, i) => Math.max(max, i.order), -1) + 1;
      await store.instruments.create({ bandId: band.id, name: value, order });
    } else if (editing) {
      await store.instruments.update(editing, { name: value });
    }
    setEditing(null);
    reload();
  }

  async function remove(id: string, label: string) {
    const n = instrumentUsage(id, songs);
    if (n > 0) return setMessage(t('usage.blocked', { n }));
    if (!window.confirm(t('common.deleteConfirm', { name: label }))) return;
    await store.instruments.remove(id);
    if (mine.id === id) await mine.set(null);
    setMessage(null);
    reload();
  }

  const form = (
    <form onSubmit={(e) => void save(e)} className="space-y-3 rounded-md border border-line bg-surface p-3">
      <Field label={t('instrument.name')}>
        <input className={inputClass} list="instrument-suggestions" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <datalist id="instrument-suggestions">
        {INSTRUMENT_SUGGESTIONS[language].map((x) => <option key={x} value={x} />)}
      </datalist>
      <div className="flex gap-2">
        <Button type="submit">{t('common.save')}</Button>
        <Button variant="secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
      </div>
    </form>
  );

  return (
    <section>
      <Title>{t('settings.instruments')}</Title>
      <p className="mb-3 text-sm text-soft">{t('instrument.hint')}</p>
      <Field label={t('instrument.mine')} className="mb-4 max-w-xs">
        <select
          className={inputClass}
          value={mine.id ?? ''}
          onChange={(e) => void mine.set(e.target.value || null)}
        >
          <option value="">{t('instrument.mineNone')}</option>
          {instruments.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </Field>
      <ul className="divide-y divide-line border-y border-line">
        {instruments.map((i) => (
          <li key={i.id} className="py-2">
            {editing === i.id ? form : (
              <div className="flex min-h-[44px] items-center gap-3">
                <span className="flex-1 text-base font-semibold">{i.name}</span>
                {canEdit && (
                  <>
                    <Button variant="secondary" onClick={() => open(i.id, i.name)}>{t('common.edit')}</Button>
                    <Button variant="danger" onClick={() => void remove(i.id, i.name)}>{t('common.delete')}</Button>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {message && <p role="alert" className="mt-2 text-sm font-semibold text-lei">{message}</p>}
      {canEdit && (
        <div className="mt-3">
          {editing === 'new' ? form : <Button variant="secondary" onClick={() => open('new', '')}>+ {t('instrument.add')}</Button>}
        </div>
      )}
    </section>
  );
}
