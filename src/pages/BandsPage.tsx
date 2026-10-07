import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthForm } from '../components/AuthForm';
import { Modal } from '../components/Modal';
import { Button, Field, inputClass, PageTitle } from '../components/ui';
import { useCloud } from '../cloud/CloudProvider';
import { errorMessageKey } from '../cloud/errors';
import type { Band } from '../core/types';
import { useData } from '../data/DataProvider';
import { useQuery } from '../hooks/useQuery';
import { useT } from '../i18n';
import { useUiStore } from '../state/uiStore';

function Group({ title, empty, children, count }: { title: string; empty: string; children: ReactNode; count: number }) {
  return (
    <section>
      <h2 className="mb-2 font-display text-xl font-bold uppercase tracking-wide">{title}</h2>
      {count === 0 ? <p className="text-sm text-soft">{empty}</p> : <ul className="divide-y divide-line border-y border-line">{children}</ul>}
    </section>
  );
}

function BandRow({ band, badge, active }: { band: Band; badge?: string | undefined; active: boolean }) {
  const t = useT();
  return (
    <li className="flex min-h-[56px] items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-semibold">{band.name}</div>
        <div className="text-sm text-soft">{[badge, active ? t('bands.showing') : null].filter(Boolean).join(' · ')}</div>
      </div>
      <Link to={`/bands/${band.id}`} className="inline-flex h-11 items-center rounded-md border border-line bg-surface px-4 text-base font-semibold">
        {t('bands.open')}
      </Link>
    </li>
  );
}

/** Account first (sign in), then the bands: the ones you created, the ones you joined, and the ones kept only here. */
export default function BandsPage() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const cloud = useCloud();
  const { store, band: active } = useData();
  const language = useUiStore((s) => s.language);
  void language;
  const bands = useQuery(() => store.bands.listAll(), [store, cloud.linked]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [invite, setInvite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const flash = (location.state as { flash?: string } | null)?.flash;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const band = await cloud.createBand(name.trim());
      navigate(`/bands/${band.id}`);
    } catch (e) {
      setError(t(errorMessageKey(e)));
    } finally {
      setBusy(false);
    }
  }
  function join() {
    const token = invite.trim().split('/').filter(Boolean).pop();
    if (token) navigate(`/join/${token}`);
  }

  const all = [...(bands.data ?? [])].sort((a, b) => a.createdAt - b.createdAt);
  const shared = all.filter((b) => cloud.linked.has(b.id));
  const owned = shared.filter((b) => cloud.roles[b.id] === 'creator');
  const member = shared.filter((b) => cloud.roles[b.id] !== 'creator');
  const local = all.filter((b) => !cloud.linked.has(b.id));

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6">
      <PageTitle>{t('bands.title')}</PageTitle>
      {flash && <p role="status" className="rounded-lg border border-line border-l-4 border-l-io bg-surface px-3 py-2 text-sm">{flash}</p>}

      {!cloud.configured ? (
        <p className="text-sm text-soft">{t('cloud.off')}</p>
      ) : cloud.user === undefined ? (
        <p className="text-sm text-soft">{t('app.loading')}</p>
      ) : cloud.user === null ? (
        <section className="space-y-3">
          <h2 className="font-display text-xl font-bold uppercase tracking-wide">{t('bands.account')}</h2>
          <p className="text-sm text-soft">{t('bands.intro')}</p>
          <AuthForm />
        </section>
      ) : (
        <>
          <section className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 break-all text-sm font-semibold">{t('cloud.signedInAs', { email: cloud.user.email })}</p>
            <Button variant="secondary" onClick={() => void cloud.api?.signOut()}>{t('cloud.signOut')}</Button>
          </section>

          <section className="space-y-3 rounded-lg border border-line bg-surface p-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setCreating(true)}>{t('bands.create')}</Button>
            </div>
            <Field label={t('bands.join')} hint={t('bands.joinHint')}>
              <div className="flex gap-2">
                <input className={inputClass} value={invite} onChange={(e) => setInvite(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && join()} />
                <Button variant="secondary" disabled={!invite.trim()} onClick={join}>{t('bands.joinGo')}</Button>
              </div>
            </Field>
          </section>

          <Group title={t('bands.owned')} empty={t('bands.noneOwned')} count={owned.length}>
            {owned.map((b) => <BandRow key={b.id} band={b} badge={t('cloud.role.creator')} active={b.id === active.id} />)}
          </Group>
          <Group title={t('bands.member')} empty={t('bands.noneMember')} count={member.length}>
            {member.map((b) => {
              const role = cloud.roles[b.id];
              return <BandRow key={b.id} band={b} badge={role ? t(`cloud.role.${role}`) : undefined} active={b.id === active.id} />;
            })}
          </Group>
        </>
      )}

      {/* Bands kept only here exist with or without an account, so they are always listed. */}
      <Group title={t('bands.local')} empty={t('bands.noneLocal')} count={local.length}>
        {local.map((b) => <BandRow key={b.id} band={b} active={b.id === active.id} />)}
      </Group>

      {creating && (
        <Modal title={t('bands.create')} onClose={() => !busy && setCreating(false)}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void create(); }}>
            <Field label={t('bands.createName')}>
              <input className={inputClass} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            {error && <p role="alert" className="text-sm font-semibold text-lei">{error}</p>}
            <div className="flex gap-3">
              <Button type="submit" disabled={busy || !name.trim()}>{t('bands.createGo')}</Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setCreating(false)}>{t('common.cancel')}</Button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
