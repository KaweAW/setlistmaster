import { useState } from 'react';
import { Link } from 'react-router-dom';
import { backupReminderDue, daysSince } from '../core/backup';
import { useT } from '../i18n';
import { usePwaStore } from '../state/pwaStore';
import { useStorageStore } from '../state/storageStore';
import { useUiStore } from '../state/uiStore';
import { Button, buttonClass } from './ui';

const SNOOZE_DAYS = 3;

function Notice({ children, actions }: { children: React.ReactNode; actions: React.ReactNode }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface p-3 text-sm">
      <p className="min-w-[14rem] flex-1">{children}</p>
      <div className="flex gap-2">{actions}</div>
    </div>
  );
}

/**
 * Things the user should know, at the top of the main screens: a new version, "ready for offline",
 * data that the browser might delete, and the periodic backup reminder. Never shown in stage mode.
 */
export function NoticeBar() {
  const t = useT();
  const stage = useUiStore((s) => s.stageMode);
  const { needRefresh, offlineReady, applyUpdate, dismissOfflineReady } = usePwaStore();
  const persistence = useStorageStore((s) => s.persistence);
  const { lastBackupAt, firstSeenAt, backupSnoozedUntil, snoozeBackup } = useUiStore();
  const [storageDismissed, setStorageDismissed] = useState(false);
  const [now] = useState(() => Date.now());

  if (stage) return null;

  const backupDue = backupReminderDue({ now, lastBackupAt, firstSeenAt, snoozedUntil: backupSnoozedUntil });
  const days = daysSince(lastBackupAt, now);
  const secondary = 'h-9 px-3 text-sm';

  return (
    <div className="space-y-2 empty:hidden">
      {needRefresh && (
        <Notice actions={<Button className={secondary} onClick={applyUpdate}>{t('notice.updateAction')}</Button>}>
          {t('notice.update')}
        </Notice>
      )}
      {offlineReady && (
        <Notice actions={<Button variant="secondary" className={secondary} onClick={dismissOfflineReady}>{t('notice.ok')}</Button>}>
          {t('notice.offlineReady')}
        </Notice>
      )}
      {(persistence === 'denied' || persistence === 'unsupported') && !storageDismissed && (
        <Notice actions={<Button variant="secondary" className={secondary} onClick={() => setStorageDismissed(true)}>{t('notice.dismiss')}</Button>}>
          {t('notice.storage')}
        </Notice>
      )}
      {backupDue && (
        <Notice
          actions={
            <>
              <Link to="/settings" className={`${buttonClass('primary')} ${secondary}`}>{t('notice.backupNow')}</Link>
              <Button variant="secondary" className={secondary} onClick={() => snoozeBackup(now + SNOOZE_DAYS * 86_400_000)}>
                {t('notice.later')}
              </Button>
            </>
          }
        >
          {days === null ? t('notice.backupNever') : t('notice.backupDays', { n: days })}
        </Notice>
      )}
    </div>
  );
}
