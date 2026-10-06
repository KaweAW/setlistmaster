import { useState } from 'react';
import { performerUsage, tuningUsage } from '../core/usage';
import { useCanEdit } from '../cloud/CloudProvider';
import { PerformerBadge } from '../components/PerformerBadge';
import { PerformerForm } from '../components/PerformerForm';
import { CloudSection } from '../components/CloudSection';
import { AppearanceSection, BackupSection, DangerSection, DataSection } from '../components/SettingsData';
import { TuningChip } from '../components/TuningChip';
import { TuningForm } from '../components/TuningForm';
import { Button, Field, inputClass, PageTitle } from '../components/ui';
import { useData } from '../data/DataProvider';
import { useQuery } from '../hooks/useQuery';
import { useT, type Language } from '../i18n';
import { useUiStore } from '../state/uiStore';

export default function SettingsPage() {
  const t = useT();
  const language = useUiStore((s) => s.language);
  const setLanguage = useUiStore((s) => s.setLanguage);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6">
      <PageTitle>{t('settings.title')}</PageTitle>

      <section>
        <Field label={t('settings.language')} className="max-w-xs">
          <select className={inputClass} value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
            <option value="it">Italiano</option>
            <option value="en">English</option>
          </select>
        </Field>
      </section>

      <AppearanceSection />
      <CloudSection />
      <PerformersSection />
      <TuningsSection />
      <DataSection />
      <BackupSection />
      <DangerSection />
    </main>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="mb-3 flex items-baseline gap-2.5 font-display text-xl font-bold uppercase tracking-wide after:h-px after:flex-1 after:self-center after:bg-line after:content-['']">
      {children}
    </h2>
  );
}

function useBandUsage() {
  const { store, band } = useData();
  return useQuery(async () => {
    const [performers, tunings, songs, items] = await Promise.all([
      store.performers.listBy('bandId', band.id),
      store.tunings.listBy('bandId', band.id),
      store.songs.listBy('bandId', band.id),
      store.items.listBy('bandId', band.id),
    ]);
    performers.sort((a, b) => a.createdAt - b.createdAt);
    tunings.sort((a, b) => Number(b.isStandard) - Number(a.isStandard) || a.createdAt - b.createdAt);
    return { performers, tunings, songs, items };
  }, [store, band.id]);
}

function PerformersSection() {
  const t = useT();
  const { store, band } = useData();
  const canEdit = useCanEdit(band.id);
  const { data, reload } = useBandUsage();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!data) return null;

  async function remove(id: string, name: string) {
    const n = performerUsage(id, data!.songs, data!.items);
    if (n > 0) return setMessage(t('usage.blocked', { n }));
    if (!window.confirm(t('common.deleteConfirm', { name }))) return;
    await store.performers.remove(id);
    setMessage(null);
    reload();
  }

  return (
    <section>
      <SectionTitle>{t('settings.performers')}</SectionTitle>
      <ul className="divide-y divide-line border-y border-line">
        {data.performers.map((p) => (
          <li key={p.id} className="py-2">
            {editing === p.id ? (
              <PerformerForm
                initial={{ name: p.name, symbol: p.symbol, color: p.color }}
                onCancel={() => setEditing(null)}
                onSubmit={async (v) => {
                  await store.performers.update(p.id, v);
                  setEditing(null);
                  reload();
                }}
              />
            ) : (
              <div className="flex min-h-[44px] items-center gap-3">
                <PerformerBadge performer={p} size={28} />
                <span className="flex-1 text-base font-semibold">{p.name}</span>
                {canEdit && <Button variant="secondary" onClick={() => setEditing(p.id)}>{t('common.edit')}</Button>}
                {canEdit && <Button variant="danger" onClick={() => void remove(p.id, p.name)}>{t('common.delete')}</Button>}
              </div>
            )}
          </li>
        ))}
      </ul>
      {message && <p role="alert" className="mt-2 text-sm font-semibold text-lei">{message}</p>}
      <div className="mt-3">
        {editing === 'new' ? (
          <PerformerForm
            onCancel={() => setEditing(null)}
            onSubmit={async (v) => {
              await store.performers.create({ bandId: band.id, ...v });
              setEditing(null);
              reload();
            }}
          />
        ) : (
          canEdit && <Button variant="secondary" onClick={() => setEditing('new')}>+ {t('performer.add')}</Button>
        )}
      </div>
    </section>
  );
}

function TuningsSection() {
  const t = useT();
  const { store, band } = useData();
  const canEdit = useCanEdit(band.id);
  const { data, reload } = useBandUsage();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!data) return null;

  async function remove(id: string, name: string) {
    const n = tuningUsage(id, data!.songs, data!.items);
    if (n > 0) return setMessage(t('usage.blocked', { n }));
    if (!window.confirm(t('common.deleteConfirm', { name }))) return;
    await store.tunings.remove(id);
    setMessage(null);
    reload();
  }

  return (
    <section>
      <SectionTitle>{t('settings.tunings')}</SectionTitle>
      <ul className="divide-y divide-line border-y border-line">
        {data.tunings.map((x) => (
          <li key={x.id} className="py-2">
            {editing === x.id ? (
              <TuningForm
                initial={{ name: x.name, notes: x.notes }}
                onCancel={() => setEditing(null)}
                onSubmit={async (v) => {
                  await store.tunings.update(x.id, v);
                  setEditing(null);
                  reload();
                }}
              />
            ) : (
              <div className="flex min-h-[44px] items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold">{x.name}</div>
                  {x.notes && !x.isStandard && (
                    <div className="mt-0.5">
                      <TuningChip tuning={x} withFlat={false} />
                    </div>
                  )}
                </div>
                {x.isStandard && <span className="text-xs font-semibold text-soft">{t('tuning.standard')}</span>}
                {canEdit && <Button variant="secondary" onClick={() => setEditing(x.id)}>{t('common.edit')}</Button>}
                {canEdit && !x.isStandard && (
                  <Button variant="danger" onClick={() => void remove(x.id, x.name)}>{t('common.delete')}</Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {message && <p role="alert" className="mt-2 text-sm font-semibold text-lei">{message}</p>}
      <div className="mt-3">
        {editing === 'new' ? (
          <TuningForm
            onCancel={() => setEditing(null)}
            onSubmit={async (v) => {
              await store.tunings.create({ bandId: band.id, isStandard: false, ...v });
              setEditing(null);
              reload();
            }}
          />
        ) : (
          canEdit && <Button variant="secondary" onClick={() => setEditing('new')}>+ {t('tuning.add')}</Button>
        )}
      </div>
    </section>
  );
}
