import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { backupReminderDue, daysSince } from '../core/backup';
import { useCloud } from '../cloud/CloudProvider';
import { useData } from '../data/DataProvider';
import { useT } from '../i18n';
import { usePwaStore } from '../state/pwaStore';
import { useStorageStore } from '../state/storageStore';
import { useUiStore } from '../state/uiStore';
import { Button, buttonClass } from './ui';

const SNOOZE_DAYS = 3;
const OFFLINE_READY_MS = 6000;
const small = '!h-9 px-3 text-sm';

type Tone = 'info' | 'warn' | 'alert';
const stripe: Record<Tone, string> = { info: 'border-l-io', warn: 'border-l-acc', alert: 'border-l-lei' };

function Notice({ tone, more, children, actions }: { tone: Tone; more: number; children: ReactNode; actions: ReactNode }) {
  const t = useT();
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-l-4 border-line bg-surface px-3 py-2 text-sm motion-safe:animate-slide-down-in ${stripe[tone]}`}
    >
      <p className="min-w-[12rem] flex-1 leading-snug">
        {children}
        {more > 0 && <span className="ml-2 whitespace-nowrap text-xs text-soft">{t('notice.more', { n: more })}</span>}
      </p>
      <div className="flex gap-2">{actions}</div>
    </div>
  );
}

interface Pending {
  id: string;
  tone: Tone;
  text: string;
  actions: ReactNode;
}

/**
 * Things the user should know, at the top of the main screens. One at a time, the most important first, so the
 * screen is never pushed down by a stack of cards: dismiss it (or fix it) and the next one appears.
 * Never shown in stage mode.
 */
export function NoticeBar() {
  const t = useT();
  const stage = useUiStore((s) => s.stageMode);
  const { needRefresh, offlineReady, applyUpdate, dismissOfflineReady } = usePwaStore();
  const persistence = useStorageStore((s) => s.persistence);
  const { lastBackupAt, firstSeenAt, backupSnoozedUntil, snoozeBackup } = useUiStore();
  const { band } = useData();
  const cloud = useCloud();
  const [storageDismissed, setStorageDismissed] = useState(false);
  const [now] = useState(() => Date.now());

  // "Ready to work offline" is good news, not a task: it goes away by itself.
  useEffect(() => {
    if (!offlineReady || stage) return;
    const timer = setTimeout(dismissOfflineReady, OFFLINE_READY_MS);
    return () => clearTimeout(timer);
  }, [offlineReady, stage, dismissOfflineReady]);

  if (stage) return null;

  const backupDue = backupReminderDue({ now, lastBackupAt, firstSeenAt, snoozedUntil: backupSnoozedUntil });
  const days = daysSince(lastBackupAt, now);

  // Most important first.
  const pending: Pending[] = [];
  if (needRefresh) {
    pending.push({
      id: 'update', tone: 'info', text: t('notice.update'),
      actions: <Button className={small} onClick={applyUpdate}>{t('notice.updateAction')}</Button>,
    });
  }
  if (cloud.statuses[band.id]?.state === 'revoked') {
    pending.push({
      id: 'revoked', tone: 'alert', text: t('notice.revoked', { band: band.name }),
      actions: <Link to="/settings" className={`${buttonClass('primary')} ${small}`}>{t('notice.revokedAction')}</Link>,
    });
  }
  if ((persistence === 'denied' || persistence === 'unsupported') && !storageDismissed) {
    pending.push({
      id: 'storage', tone: 'warn', text: t('notice.storage'),
      actions: <Button variant="secondary" className={small} onClick={() => setStorageDismissed(true)}>{t('notice.dismiss')}</Button>,
    });
  }
  if (backupDue) {
    pending.push({
      id: 'backup', tone: 'warn',
      text: days === null ? t('notice.backupNever') : t('notice.backupDays', { n: days }),
      actions: (
        <>
          <Link to="/settings" className={`${buttonClass('primary')} ${small}`}>{t('notice.backupNow')}</Link>
          <Button variant="secondary" className={small} onClick={() => snoozeBackup(now + SNOOZE_DAYS * 86_400_000)}>
            {t('notice.later')}
          </Button>
        </>
      ),
    });
  }
  if (offlineReady) {
    pending.push({
      id: 'offline', tone: 'info', text: t('notice.offlineReady'),
      actions: <Button variant="secondary" className={small} onClick={dismissOfflineReady}>{t('notice.ok')}</Button>,
    });
  }

  const first = pending[0];
  if (!first) return null;
  // Keyed: when the next notice takes its place it slides in again.
  return (
    <Notice key={first.id} tone={first.tone} more={pending.length - 1} actions={first.actions}>
      {first.text}
    </Notice>
  );
}
