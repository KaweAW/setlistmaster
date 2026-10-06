import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AuthForm } from '../components/AuthForm';
import { Button, PageTitle } from '../components/ui';
import { useCloud } from '../cloud/CloudProvider';
import { errorMessageKey } from '../cloud/errors';
import type { InvitationPreview } from '../cloud/types';
import { useQuery } from '../hooks/useQuery';
import { useT } from '../i18n';

/** Where an invitation link lands: shows what it is for, asks to sign in, and joins. */
export default function JoinPage() {
  const t = useT();
  const { token = '' } = useParams();
  const cloud = useCloud();
  const [joined, setJoined] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = Boolean(cloud.user);
  const preview = useQuery<InvitationPreview | null>(
    async () => (cloud.api && signedIn ? cloud.api.previewInvitation(token) : null),
    [cloud.api, token, signedIn],
  );

  async function join(bandName: string) {
    setBusy(true);
    setError(null);
    try {
      await cloud.join(token);
      setJoined(bandName);
    } catch (e) {
      setError(t(errorMessageKey(e)));
    } finally {
      setBusy(false);
    }
  }

  const p = preview.data;
  return (
    <main className="mx-auto w-full max-w-xl space-y-5 px-4 py-6">
      <PageTitle>{t('join.title')}</PageTitle>
      {!cloud.configured ? (
        <p className="text-sm text-soft">{t('cloud.off')}</p>
      ) : cloud.user === undefined ? (
        <p className="text-sm text-soft">{t('app.loading')}</p>
      ) : cloud.user === null ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold">{t('join.signInFirst')}</p>
          <AuthForm />
        </div>
      ) : joined ? (
        <div className="space-y-3">
          <p role="status" className="font-semibold text-io">{t('join.done', { band: joined })}</p>
          <Link to="/" className="inline-flex h-11 items-center rounded-md bg-ink px-4 text-base font-semibold text-paper">{t('join.open')}</Link>
        </div>
      ) : !p ? (
        <p className="text-sm text-soft">{t('app.loading')}</p>
      ) : p.status !== 'ok' ? (
        <p role="alert" className="font-semibold text-lei">{t(`join.status.${p.status}`)}</p>
      ) : (
        <div className="space-y-3">
          <p className="text-lg">{t('join.to', { band: p.bandName ?? '', role: t(`cloud.role.${p.role ?? 'viewer'}`) })}</p>
          {p.emailBound && <p className="text-sm text-soft">{t('join.emailBound')}</p>}
          <Button disabled={busy} onClick={() => void join(p.bandName ?? '')}>{busy ? t('join.joining') : t('join.accept')}</Button>
          {error && <p role="alert" className="text-sm font-semibold text-lei">{error}</p>}
        </div>
      )}
    </main>
  );
}
