import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCloud } from '../cloud/CloudProvider';
import { errorMessageKey } from '../cloud/errors';
import type { CloudRole, InviteRole, RemoteInvitation, RemoteMember } from '../cloud/types';
import { useQuery } from '../hooks/useQuery';
import { useT } from '../i18n';
import type { BandSyncStatus } from '../sync/engine';
import { SectionTitle } from './SettingsData';
import { Button, buttonClass, Field, inputClass } from './ui';

/** The link a person opens to join: the app itself, on its /join page. */
export const inviteLink = (token: string) => `${window.location.origin}/join/${token}`;

export const roleKey = (role: CloudRole) => `cloud.role.${role}` as const;

/** In Settings: who is signed in, and the way to the page where bands are managed. */
export function CloudSection() {
  const t = useT();
  const cloud = useCloud();
  return (
    <section>
      <SectionTitle>{t('cloud.title')}</SectionTitle>
      {!cloud.configured ? (
        <p className="text-sm text-soft">{t('cloud.off')}</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-soft">
            {cloud.user ? t('cloud.signedInAs', { email: cloud.user.email }) : t('cloud.intro')}
          </p>
          <Link to="/bands" className={buttonClass('secondary')}>{cloud.user ? t('bands.manage') : t('cloud.signIn')} →</Link>
        </div>
      )}
    </section>
  );
}

export function StatusLine({ status }: { status: BandSyncStatus | undefined }) {
  const t = useT();
  if (!status) return null;
  const tone = status.state === 'idle' ? 'text-io' : status.state === 'syncing' ? 'text-soft' : 'text-lei';
  return (
    <p role="status" className={`text-sm font-semibold ${tone}`}>
      {t(`cloud.status.${status.state}`)}
      {status.pending > 0 && status.state !== 'idle' ? ` · ${t('cloud.status.pending', { n: status.pending })}` : ''}
      {status.state === 'idle' && status.lastSyncedAt ? ` · ${new Date(status.lastSyncedAt).toLocaleTimeString()}` : ''}
    </p>
  );
}

export function Members({ bandId, bandName, role }: { bandId: string; bandName: string; role: CloudRole | null }) {
  const t = useT();
  const cloud = useCloud();
  const api = cloud.api!;
  const me = cloud.user?.id;
  const isCreator = role === 'creator';
  const [error, setError] = useState<string | null>(null);
  const members = useQuery<RemoteMember[]>(() => api.members(bandId), [api, bandId]);
  const invites = useQuery<RemoteInvitation[]>(() => (isCreator ? api.invitations(bandId) : Promise.resolve([])), [api, bandId, isCreator]);

  async function act(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      members.reload();
      invites.reload();
    } catch (e) {
      setError(t(errorMessageKey(e)));
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-bold uppercase tracking-wide">{t('cloud.members')}</h3>
      <ul className="divide-y divide-line border-y border-line">
        {(members.data ?? []).map((m) => (
          <li key={m.userId} className="flex min-h-[44px] flex-wrap items-center gap-2 py-2">
            <span className="min-w-0 flex-1 break-all text-base font-semibold">
              {m.email}{m.userId === me && <span className="ml-2 text-sm font-normal text-soft">({t('cloud.you')})</span>}
            </span>
            {isCreator && m.role !== 'creator' ? (
              <>
                <select
                  aria-label={`${t('cloud.inviteRole')} ${m.email}`}
                  className={`${inputClass} !h-9 !w-auto`}
                  value={m.role}
                  onChange={(e) => void act(() => api.setMemberRole(bandId, m.userId, e.target.value as InviteRole))}
                >
                  <option value="editor">{t('cloud.role.editor')}</option>
                  <option value="viewer">{t('cloud.role.viewer')}</option>
                </select>
                <Button variant="danger" className="!h-9 px-3 text-sm" onClick={() => {
                  if (window.confirm(t('cloud.removeConfirm', { email: m.email }))) void act(() => api.removeMember(bandId, m.userId));
                }}>{t('cloud.remove')}</Button>
              </>
            ) : (
              <span className="text-sm text-soft">{t(roleKey(m.role))}</span>
            )}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-sm font-semibold text-lei">{error}</p>}
      {isCreator && (
        <InviteForm
          bandId={bandId}
          bandName={bandName}
          open={(invites.data ?? []).filter((i) => i.open)}
          onChanged={() => invites.reload()}
        />
      )}
    </div>
  );
}

export function InviteForm({ bandId, bandName, open, onChanged }: { bandId: string; bandName: string; open: RemoteInvitation[]; onChanged: () => void }) {
  const t = useT();
  const { api } = useCloud();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('editor');
  const [created, setCreated] = useState<{ link: string; email: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    try {
      const token = await api!.createInvitation(bandId, role, email);
      setCreated({ link: inviteLink(token), email: email.trim() });
      setEmail('');
      onChanged();
    } catch (e) {
      setError(t(errorMessageKey(e)));
    }
  }
  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(link);
    } catch {
      window.prompt(t('cloud.inviteLink'), link); // clipboard not allowed: show it so it can be copied by hand
    }
  }
  const mail = (link: string, to: string) =>
    `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(t('cloud.mailSubject', { band: bandName }))}&body=${encodeURIComponent(t('cloud.mailBody', { link }))}`;

  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-3">
      <h3 className="font-display text-lg font-bold uppercase tracking-wide">{t('cloud.invite')}</h3>
      <Field label={t('cloud.inviteEmail')}>
        <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label={t('cloud.inviteRole')} className="max-w-xs">
        <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as InviteRole)}>
          <option value="editor">{t('cloud.role.editor')}</option>
          <option value="viewer">{t('cloud.role.viewer')}</option>
        </select>
      </Field>
      <Button onClick={() => void create()}>{t('cloud.inviteCreate')}</Button>
      {error && <p role="alert" className="text-sm font-semibold text-lei">{error}</p>}
      {created && (
        <div className="space-y-2" data-testid="created-invite">
          <p className="text-sm font-semibold">{t('cloud.inviteLink')}</p>
          <input readOnly aria-label={t('cloud.inviteLink')} className={inputClass} value={created.link} onFocus={(e) => e.currentTarget.select()} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void copy(created.link)}>{copied === created.link ? t('cloud.copied') : t('cloud.copy')}</Button>
            <a className="inline-flex h-11 items-center rounded-md border border-line bg-surface px-4 text-base font-semibold" href={mail(created.link, created.email)}>
              {t('cloud.sendMail')}
            </a>
          </div>
        </div>
      )}
      {open.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-semibold">{t('cloud.openInvites')}</p>
          <ul className="divide-y divide-line">
            {open.map((i) => (
              <li key={i.id} className="flex min-h-[44px] flex-wrap items-center gap-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 break-all">
                  {i.email ?? t('cloud.anyone')} · {t(roleKey(i.role))} · {t('cloud.expires', { date: new Date(i.expiresAt).toLocaleDateString() })}
                </span>
                <Button variant="secondary" className="!h-9 px-3 text-sm" onClick={() => void copy(inviteLink(i.token))}>{copied === inviteLink(i.token) ? t('cloud.copied') : t('cloud.copy')}</Button>
                <Button variant="danger" className="!h-9 px-3 text-sm" onClick={() => void api!.revokeInvitation(i.id).then(onChanged)}>{t('cloud.revoke')}</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
