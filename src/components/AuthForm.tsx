import { useState, type FormEvent } from 'react';
import { errorMessageKey } from '../cloud/errors';
import { useCloud } from '../cloud/CloudProvider';
import { useT } from '../i18n';
import { Button, Field, inputClass } from './ui';

/** Email and password: sign in, or create the account. */
export function AuthForm() {
  const t = useT();
  const { api } = useCloud();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!api) return;
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'in') await api.signIn(email, password);
      else {
        const { confirmEmail } = await api.signUp(email, password);
        if (confirmEmail) {
          setMessage({ text: t('cloud.confirmEmail'), error: false });
          setMode('in');
        }
      }
    } catch (error) {
      setMessage({ text: t(errorMessageKey(error)), error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      <Field label={t('cloud.email')}>
        <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label={t('cloud.password')}>
        <input
          className={inputClass} type="password" required minLength={8} value={password}
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {message && (
        <p role={message.error ? 'alert' : 'status'} className={`text-sm font-semibold ${message.error ? 'text-lei' : 'text-io'}`}>{message.text}</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>{mode === 'in' ? t('cloud.signIn') : t('cloud.signUp')}</Button>
        <button type="button" className="h-11 text-sm font-semibold text-io" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? t('cloud.toSignUp') : t('cloud.toSignIn')}
        </button>
      </div>
    </form>
  );
}
