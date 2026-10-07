import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Members, roleKey, StatusLine } from '../components/CloudSection';
import { Modal } from '../components/Modal';
import { downloadBackup } from '../components/SettingsData';
import { Button, Field, inputClass, PageTitle, textareaClass } from '../components/ui';
import { useCloud } from '../cloud/CloudProvider';
import { errorMessageKey } from '../cloud/errors';
import type { Band } from '../core/types';
import { countBand, removeLocalBand } from '../data/bands';
import { useData } from '../data/DataProvider';
import { useQuery } from '../hooks/useQuery';
import { useT } from '../i18n';
import { useUiStore } from '../state/uiStore';

const LONG_NOTES = 140;
const card = 'rounded-lg border border-line bg-surface p-3';

export default function BandPage() {
  const t = useT();
  const { bandId = '' } = useParams();
  const navigate = useNavigate();
  const cloud = useCloud();
  const { store, band: active } = useData();
  const setActive = useUiStore((s) => s.setActiveBandId);
  const found = useQuery(() => store.bands.get(bandId), [store, bandId]);
  const [deleting, setDeleting] = useState(false);

  if (found.loading) return <p className="p-6 text-soft">{t('app.loading')}</p>;
  const band = found.data;
  if (!band) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <p className="text-soft">{t('band.notFound')}</p>
        <Link to="/bands" className="font-semibold text-io">← {t('band.back')}</Link>
      </main>
    );
  }

  const shared = cloud.linked.has(band.id);
  const role = cloud.roles[band.id] ?? null;
  const revoked = shared && (cloud.statuses[band.id]?.state === 'revoked' || (band.id in cloud.roles && cloud.roles[band.id] === null));
  const canManage = !shared || role === 'creator';
  const isActive = band.id === active.id;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
      <Link to="/bands" className="text-sm font-semibold text-io">← {t('band.back')}</Link>
      <PageTitle>{band.name}</PageTitle>

      <DetailsCard band={band} canManage={canManage} onSaved={() => found.reload()} />

      <section className={`${card} space-y-3`}>
        {shared ? (
          <>
            <p className="text-sm font-semibold">{t('cloud.shared')}{role && ` · ${t('cloud.yourRole', { role: t(roleKey(role)) })}`}</p>
            {role && <p className="text-sm text-soft">{t(`cloud.roleHint.${role}`)}</p>}
            <StatusLine status={cloud.statuses[band.id]} />
            {revoked && <p className="text-sm text-soft">{t('cloud.revokedHint')}</p>}
          </>
        ) : (
          <>
            <p className="text-sm text-soft">{t('band.localHint')}</p>
            {cloud.configured && cloud.user && <ShareButton band={band} />}
          </>
        )}
        <div className="flex flex-wrap gap-2">
          {!isActive && <Button onClick={() => { setActive(band.id); navigate('/'); }}>{t('band.use')}</Button>}
          {shared && !revoked && <Button variant="secondary" onClick={() => void cloud.syncNow(band.id)}>{t('cloud.syncNow')}</Button>}
          {shared && (role === 'creator' || revoked) && (
            <Button variant="secondary" onClick={() => { if (window.confirm(t('cloud.unlinkConfirm'))) void cloud.unlink(band.id); }}>{t('cloud.unlink')}</Button>
          )}
        </div>
      </section>

      {shared && !revoked && cloud.api && <Members bandId={band.id} bandName={band.name} role={role} />}

      <section className={`${card} space-y-3 border-lei/40`}>
        <h2 className="font-display text-xl font-bold uppercase tracking-wide text-lei">{t('band.danger')}</h2>
        {shared && !revoked && (role === 'editor' || role === 'viewer') ? (
          <LeaveButton bandId={band.id} />
        ) : (
          <Button variant="danger" onClick={() => setDeleting(true)}>{shared && !revoked ? t('band.delete') : t('band.deleteLocal')}</Button>
        )}
      </section>

      {deleting && <DeleteDialog band={band} shared={shared && !revoked} onClose={() => setDeleting(false)} />}
    </main>
  );
}

function ShareButton({ band }: { band: Band }) {
  const t = useT();
  const cloud = useCloud();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <p className="text-sm text-soft">{t('cloud.shareHint')}</p>
      <Button onClick={() => { setError(null); cloud.share(band).catch((e: unknown) => setError(t(errorMessageKey(e)))); }}>{t('band.share')}</Button>
      {error && <p role="alert" className="text-sm font-semibold text-lei">{error}</p>}
    </div>
  );
}

function LeaveButton({ bandId }: { bandId: string }) {
  const t = useT();
  const cloud = useCloud();
  const navigate = useNavigate();
  return (
    <Button variant="danger" onClick={() => {
      if (!window.confirm(t('cloud.leaveConfirm'))) return;
      void (async () => { await cloud.api?.leaveBand(bandId); await cloud.unlink(bandId); navigate('/bands'); })();
    }}>{t('cloud.leave')}</Button>
  );
}

/** Name and notes. Notes longer than a few lines open in a popup, where the creator can also edit them. */
function DetailsCard({ band, canManage, onSaved }: { band: Band; canManage: boolean; onSaved: () => void }) {
  const t = useT();
  const cloud = useCloud();
  const [name, setName] = useState(band.name);
  const [notes, setNotes] = useState(band.notes ?? '');
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const saved = band.notes ?? '';
  const long = saved.length > LONG_NOTES || saved.split('\n').length > 3;
  const dirty = name.trim() !== band.name || notes !== saved;

  async function save() {
    setMessage(null);
    try {
      await cloud.saveBand(band.id, { name, notes });
      setMessage({ ok: true, text: t('band.saved') });
      setOpen(false);
      onSaved();
    } catch (e) {
      setMessage({ ok: false, text: t(errorMessageKey(e)) });
    }
  }

  return (
    <section className={`${card} space-y-3`}>
      <h2 className="font-display text-xl font-bold uppercase tracking-wide">{t('band.details')}</h2>
      {canManage ? (
        <Field label={t('band.name')}>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      ) : (
        <p className="text-sm text-soft">{t('band.readOnlyHint')}</p>
      )}

      <div>
        <p className="mb-1 text-sm font-semibold">{t('band.notes')}</p>
        {saved ? (
          <p className={`whitespace-pre-wrap text-sm ${long ? 'line-clamp-3' : ''}`}>{saved}</p>
        ) : (
          <p className="text-sm text-soft">{t('band.notesEmpty')}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {(canManage || long) && (
            <Button variant="secondary" onClick={() => { setNotes(saved); setOpen(true); }}>
              {canManage ? t('band.notesEdit') : t('band.notesRead')}
            </Button>
          )}
          {canManage && long && <Button variant="secondary" onClick={() => { setNotes(saved); setOpen(true); }}>{t('band.notesRead')}</Button>}
        </div>
      </div>

      {canManage && (
        <div className="flex items-center gap-3">
          <Button disabled={!dirty || !name.trim() || notes !== saved} onClick={() => void save()}>{t('common.save')}</Button>
          {message && <p role={message.ok ? 'status' : 'alert'} className={`text-sm font-semibold ${message.ok ? 'text-io' : 'text-lei'}`}>{message.text}</p>}
        </div>
      )}

      {open && (
        <Modal title={t('band.notes')} onClose={() => setOpen(false)}>
          <div className="space-y-4">
            {canManage ? (
              <Field label={t('band.notes')}>
                <textarea className={textareaClass} rows={10} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            ) : (
              <p className="whitespace-pre-wrap text-base">{saved}</p>
            )}
            {message && !message.ok && <p role="alert" className="text-sm font-semibold text-lei">{message.text}</p>}
            <div className="flex gap-3">
              {canManage && <Button disabled={notes === saved} onClick={() => void save()}>{t('common.save')}</Button>}
              <Button variant="secondary" onClick={() => setOpen(false)}>{canManage ? t('common.cancel') : 'OK'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

/** Deleting takes the setlists with it, so: say what goes, offer a backup, make the person type the name, tell the members. */
function DeleteDialog({ band, shared, onClose }: { band: Band; shared: boolean; onClose: () => void }) {
  const t = useT();
  const cloud = useCloud();
  const navigate = useNavigate();
  const { store } = useData();
  const markBackupDone = useUiStore((s) => s.markBackupDone);
  const setActive = useUiStore((s) => s.setActiveBandId);
  const counts = useQuery(() => countBand(store, band.id), [store, band.id]);
  const members = useQuery(() => (shared && cloud.api ? cloud.api.members(band.id) : Promise.resolve([])), [shared, band.id, cloud.api]);
  const [typed, setTyped] = useState('');
  const [keepCopy, setKeepCopy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [backedUp, setBackedUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = Math.max(0, (members.data?.length ?? 1) - 1);
  const ready = typed.trim() === band.name.trim() && !busy;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      let flash: string;
      if (shared) {
        const told = await cloud.deleteBand(band.id, { keepCopy });
        flash = t('bands.deleted', { name: band.name, n: told });
      } else {
        await removeLocalBand(store, band.id);
        if (useUiStore.getState().activeBandId === band.id) setActive(null);
        flash = t('bands.deletedLocal', { name: band.name });
      }
      navigate('/bands', { state: { flash }, replace: true });
    } catch (e) {
      setError(t(errorMessageKey(e)));
      setBusy(false);
    }
  }

  return (
    <Modal title={t('band.deleteTitle', { name: band.name })} onClose={() => !busy && onClose()}>
      <div className="space-y-4">
        <p className="text-sm font-semibold text-lei">
          {t(shared ? 'band.deleteWarn' : 'band.deleteWarnLocal', { setlists: counts.data?.setlists ?? '…', songs: counts.data?.songs ?? '…' })}
        </p>
        {shared && others > 0 && <p className="text-sm">{t('band.deleteTold', { n: others })}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => void downloadBackup(store, markBackupDone).then((ok) => ok && setBackedUp(true))}>{t('band.deleteBackup')}</Button>
          {backedUp && <span role="status" className="text-sm font-semibold text-io">{t('band.deleteBackupDone')}</span>}
        </div>
        {shared && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={keepCopy} onChange={(e) => setKeepCopy(e.target.checked)} />
            {t('band.deleteKeep')}
          </label>
        )}
        <Field label={t('band.deleteType')}>
          <input className={inputClass} value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} placeholder={band.name} />
        </Field>
        {error && <p role="alert" className="text-sm font-semibold text-lei">{error}</p>}
        <div className="flex gap-3">
          <Button variant="danger" disabled={!ready} onClick={() => void run()}>{shared ? t('band.deleteGo') : t('band.deleteGoLocal')}</Button>
          <Button variant="secondary" disabled={busy} onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      </div>
    </Modal>
  );
}
