import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import { createBackup, parseBackup, type BackupError, type BackupSummary } from '../core/backup';
import { formatBytes, formatDate } from '../core/format';
import type { StoreSnapshot } from '../core/types';
import { useData } from '../data/DataProvider';
import { useT, type MessageKey } from '../i18n';
import { reloadApp } from '../lib/reload';
import { saveFile } from '../lib/saveFile';
import { useStorageStore } from '../state/storageStore';
import { useUiStore, type Theme } from '../state/uiStore';
import { StageToggle } from './StageToggle';
import { Button, buttonClass, Field, inputClass } from './ui';

export function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="mb-3 flex items-baseline gap-2.5 font-display text-xl font-bold uppercase tracking-wide after:h-px after:flex-1 after:self-center after:bg-line after:content-['']">
      {children}
    </h2>
  );
}

export function AppearanceSection() {
  const t = useT();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  return (
    <section>
      <SectionTitle>{t('settings.appearance')}</SectionTitle>
      <div className="space-y-4">
        <Field label={t('settings.theme')} className="max-w-xs">
          <select className={inputClass} value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
            <option value="light">{t('theme.light')}</option>
            <option value="dark">{t('theme.dark')}</option>
          </select>
        </Field>
        <div>
          <p className="mb-1 text-sm font-semibold">{t('settings.stage')}</p>
          <p className="mb-2 text-sm text-soft">{t('settings.stageHint')}</p>
          <StageToggle />
        </div>
      </div>
    </section>
  );
}

/** True once a service worker is active: from then on the app opens without a network. */
function useOfflineReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void navigator.serviceWorker?.ready.then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return ready;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
      <dt className="text-sm font-semibold">{label}</dt>
      <dd className="text-sm text-soft">{children}</dd>
    </div>
  );
}

export function DataSection() {
  const t = useT();
  const language = useUiStore((s) => s.language);
  const lastBackupAt = useUiStore((s) => s.lastBackupAt);
  const { persistence, usage, check } = useStorageStore();
  const offline = useOfflineReady();
  const storageText: Record<string, MessageKey> = {
    persisted: 'data.storageYes',
    denied: 'data.storageNo',
    unsupported: 'data.storageUnsupported',
  };

  return (
    <section>
      <SectionTitle>{t('settings.data')}</SectionTitle>
      <dl className="divide-y divide-line border-y border-line">
        <Row label={t('data.offline')}>
          <span className={offline ? 'font-semibold text-io' : ''}>
            {offline ? `✓ ${t('data.offlineYes')}` : t('data.offlineNo')}
          </span>
        </Row>
        <Row label={t('data.storage')}>
          <span className={persistence === 'persisted' ? 'font-semibold text-io' : persistence === 'unknown' ? '' : 'font-semibold text-lei'}>
            {persistence === 'unknown' ? '…' : t(storageText[persistence]!)}
          </span>
          {usage && <span className="ml-2">· {t('data.usage', { used: formatBytes(usage.used) })}</span>}
        </Row>
        <Row label={t('data.lastBackup')}>
          {lastBackupAt ? formatDate(new Date(lastBackupAt).toISOString().slice(0, 10), language) : t('data.never')}
        </Row>
      </dl>
      {(persistence === 'denied' || persistence === 'unsupported') && (
        <Button variant="secondary" className="mt-3" onClick={() => void check()}>{t('data.protect')}</Button>
      )}
    </section>
  );
}

const ERROR_TEXT: Record<BackupError, MessageKey> = {
  'not-json': 'backup.error.notJson',
  'wrong-format': 'backup.error.wrongFormat',
  'newer-version': 'backup.error.newer',
  'invalid-data': 'backup.error.invalid',
};

interface Pending {
  snapshot: StoreSnapshot;
  summary: BackupSummary;
  exportedAt: number;
}

export function BackupSection() {
  const t = useT();
  const language = useUiStore((s) => s.language);
  const markBackupDone = useUiStore((s) => s.markBackupDone);
  const { store } = useData();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  async function download() {
    setBusy(true);
    setMessage(null);
    try {
      const backup = createBackup(await store.bulk.readAll(), Date.now());
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      const result = await saveFile(blob, `scaletta-backup-${new Date().toISOString().slice(0, 10)}.json`);
      if (result !== 'cancelled') {
        markBackupDone();
        setMessage({ ok: true, text: t('backup.saved') });
      }
    } catch {
      setMessage({ ok: false, text: t('backup.error.failed') });
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be chosen again
    if (!file) return;
    setMessage(null);
    const result = parseBackup(await file.text());
    if (result.ok) setPending(result);
    else setMessage({ ok: false, text: t(ERROR_TEXT[result.error]) });
  }

  async function restore() {
    if (!pending) return;
    try {
      await store.bulk.replaceAll(pending.snapshot);
      reloadApp(); // every screen starts again from the restored data
    } catch {
      setPending(null);
      setMessage({ ok: false, text: t('backup.error.failed') });
    }
  }

  return (
    <section id="backup">
      <SectionTitle>{t('backup.title')}</SectionTitle>
      <p className="mb-3 text-sm text-soft">{t('backup.hint')}</p>
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy} onClick={() => void download()}>{t('backup.download')}</Button>
        <label className={`${buttonClass('secondary')} cursor-pointer focus-within:ring-2 focus-within:ring-io`}>
          <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => void onFile(e)} />
          {t('backup.restore')}
        </label>
      </div>
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`mt-3 text-sm font-semibold ${message.ok ? 'text-io' : 'text-lei'}`}>
          {message.text}
        </p>
      )}
      {pending && (
        <div role="alertdialog" aria-label={t('backup.restoreTitle')} className="mt-4 space-y-3 rounded-lg border border-lei/40 bg-lei/5 p-4">
          <h3 className="font-display text-lg font-bold uppercase tracking-wide">{t('backup.restoreTitle')}</h3>
          <p className="text-sm">
            {t('backup.summary', {
              ...pending.summary,
              date: formatDate(new Date(pending.exportedAt).toISOString().slice(0, 10), language),
            })}
          </p>
          <p className="text-sm font-semibold text-lei">{t('backup.warning')}</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="danger" onClick={() => void restore()}>{t('backup.replace')}</Button>
            <Button variant="secondary" disabled={busy} onClick={() => void download()}>{t('backup.saveFirst')}</Button>
            <Button variant="secondary" onClick={() => setPending(null)}>{t('common.cancel')}</Button>
          </div>
        </div>
      )}
    </section>
  );
}

export function DangerSection() {
  const t = useT();
  const { store } = useData();

  async function wipe() {
    if (!window.confirm(t('danger.confirm1')) || !window.confirm(t('danger.confirm2'))) return;
    await store.bulk.clearAll();
    reloadApp(); // starts again from the example setlist
  }

  return (
    <section>
      <SectionTitle>{t('danger.title')}</SectionTitle>
      <p className="mb-3 text-sm text-soft">{t('danger.hint')}</p>
      <Button variant="danger" onClick={() => void wipe()}>{t('danger.delete')}</Button>
    </section>
  );
}
