import { useState } from 'react';
import { useCanEdit, useCloud } from '../cloud/CloudProvider';
import { groupBands } from '../core/bandTabs';
import type { Band, Setlist, Song } from '../core/types';
import { copySetlistToBand, copySongsToBand } from '../data/copySetlist';
import { useData } from '../data/DataProvider';
import { useQuery } from '../hooks/useQuery';
import { useT } from '../i18n';
import { rememberSlide } from '../state/bandSlide';
import { useUiStore } from '../state/uiStore';
import { Modal } from './Modal';
import { Button } from './ui';

function Target({ band, label, onPick, busy }: { band: Band; label: string; onPick: () => void; busy: boolean }) {
  const canEdit = useCanEdit(band.id);
  if (!canEdit) return null;
  return (
    <li>
      <Button variant="secondary" className="w-full justify-start" disabled={busy} onClick={onPick}>{label}</Button>
    </li>
  );
}

export function CopySetlistDialog({ setlist, onClose }: { setlist: Setlist; onClose: () => void }) {
  const { store } = useData();
  const t = useT();
  return (
    <CopyToBandDialog
      title={t('copy.title', { title: setlist.title })}
      hint={t('copy.hint')}
      onCopy={async (target, name) => {
        await copySetlistToBand(store, setlist.id, target.id);
        return t('copy.done', { band: name });
      }}
      onClose={onClose}
    />
  );
}

/** The same for one song of the library (the band keeps its own copy: edits there do not touch the other band's song). */
export function CopySongDialog({ song, onClose }: { song: Song; onClose: () => void }) {
  const { store } = useData();
  const t = useT();
  return (
    <CopyToBandDialog
      title={t('copy.title', { title: song.title })}
      hint={t('copy.songHint')}
      onCopy={async (target, name) => {
        const { copied } = await copySongsToBand(store, [song.id], target.id);
        return copied > 0 ? t('copy.done', { band: name }) : t('copy.songExists', { band: name });
      }}
      onClose={onClose}
    />
  );
}

/** Choose where to copy to: the personal space or any band the person can edit (other than this one). */
function CopyToBandDialog({
  title,
  hint,
  onCopy,
  onClose,
}: {
  title: string;
  hint: string;
  onCopy: (target: Band, name: string) => Promise<string>;
  onClose: () => void;
}) {
  const t = useT();
  const { store, band } = useData();
  const cloud = useCloud();
  const setActive = useUiStore((s) => s.setActiveBandId);
  const bands = useQuery(() => store.bands.listAll(), [store, cloud.linked]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [done, setDone] = useState<{ band: Band; name: string; message: string } | null>(null);

  const { personal } = groupBands(bands.data ?? [], cloud.linked);
  const nameOf = (b: Band) => (personal?.id === b.id ? t('tabs.personal') : b.name);
  const targets = (bands.data ?? []).filter((b) => b.id !== band.id).sort((a, b) => a.createdAt - b.createdAt);

  async function pick(target: Band) {
    setBusy(true);
    setError(false);
    try {
      const message = await onCopy(target, nameOf(target));
      setDone({ band: target, name: nameOf(target), message });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      {done ? (
        <div className="flex flex-col gap-3">
          <p role="status">{done.message}</p>
          <div className="flex gap-2">
            <Button onClick={() => { rememberSlide('right'); setActive(done.band.id); onClose(); }}>{t('copy.open', { band: done.name })}</Button>
            <Button variant="secondary" onClick={onClose}>{t('copy.close')}</Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-soft">{hint}</p>
          {targets.length === 0 && bands.data && <p>{t('copy.none')}</p>}
          <ul className="flex flex-col gap-2">
            {targets.map((b) => <Target key={b.id} band={b} label={nameOf(b)} busy={busy} onPick={() => void pick(b)} />)}
          </ul>
          {error && <p role="alert" className="mt-3 text-sm font-semibold text-lei">{t('copy.error')}</p>}
          <Button variant="secondary" className="mt-4 w-full" onClick={onClose}>{t('copy.close')}</Button>
        </>
      )}
    </Modal>
  );
}
