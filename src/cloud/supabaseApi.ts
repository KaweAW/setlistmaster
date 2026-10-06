import type { SupabaseClient } from '@supabase/supabase-js';
import type { SyncKind, SyncRecord } from '../core/sync';
import { RemoteError, type RemoteClient } from '../sync/engine';
import { cloudConfig } from './config';
import {
  CloudError, type CloudApi, type CloudErrorCode, type CloudRole, type CloudUser, type InvitationPreview,
  type InvitationStatus, type InviteRole, type RemoteInvitation, type RemoteMember,
} from './types';

interface DbError {
  message?: string;
  code?: string;
  name?: string;
}

const NETWORK = /failed to fetch|networkerror|network request failed|load failed|fetch failed/i;
const KNOWN: CloudErrorCode[] = [
  'creator_only', 'invitation_wrong_email', 'invitation_revoked', 'invitation_used', 'invitation_expired',
  'invitation_not_found', 'creator_cannot_leave',
];

/** The server raises named exceptions (see the migration): turn what comes back into one typed error. */
export function toCloudError(error: DbError): CloudError {
  const message = error.message ?? 'error';
  if (NETWORK.test(message) || error.name === 'AuthRetryableFetchError') return new CloudError('network', message);
  const known = KNOWN.find((code) => message.includes(code));
  if (known) return new CloudError(known, message);
  if (error.code === '42501' || /not_a_member|read_only|row-level security/.test(message)) return new CloudError('forbidden', message);
  if (error.code === '28000' || /not_authenticated|jwt/i.test(message)) return new CloudError('auth', message);
  return new CloudError('other', message);
}

const asRemoteError = (error: DbError): RemoteError => {
  const e = toCloudError(error);
  return new RemoteError(e.code === 'network' ? 'network' : e.code === 'forbidden' ? 'forbidden' : 'other', e.message);
};

interface RecordRow {
  kind: SyncKind;
  id: string;
  band_id: string;
  data: Record<string, unknown>;
  updated_at: number;
  deleted_at: number | null;
  seq: number;
}
const fromRow = (row: RecordRow): SyncRecord => ({
  kind: row.kind, id: row.id, bandId: row.band_id, data: row.data,
  updatedAt: Number(row.updated_at), deletedAt: row.deleted_at === null ? null : Number(row.deleted_at), seq: Number(row.seq),
});

/** Opens the Supabase client the first time it is needed (the library is large: it loads on demand). */
async function connect(): Promise<SupabaseClient> {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(cloudConfig.url, cloudConfig.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
}

export function createSupabaseApi(): CloudApi {
  let clientPromise: Promise<SupabaseClient> | null = null;
  const client = () => (clientPromise ??= connect());
  const asUser = (u: { id: string; email?: string | undefined } | null | undefined): CloudUser | null =>
    u ? { id: u.id, email: u.email ?? '' } : null;

  /** Runs one RPC and throws a typed error on failure. */
  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    let result;
    try {
      result = await (await client()).rpc(name, args);
    } catch (e) {
      throw toCloudError({ message: e instanceof Error ? e.message : String(e) });
    }
    if (result.error) throw toCloudError(result.error);
    return result.data as T;
  }
  async function select<T>(run: (db: SupabaseClient) => PromiseLike<{ data: T | null; error: DbError | null }>): Promise<T> {
    let result;
    try {
      result = await run(await client());
    } catch (e) {
      throw toCloudError({ message: e instanceof Error ? e.message : String(e) });
    }
    if (result.error) throw toCloudError(result.error);
    return result.data as T;
  }

  const remote: RemoteClient = {
    async push(bandId, records) {
      const payload = records.map((r) => ({ kind: r.kind, id: r.id, data: r.data, updated_at: r.updatedAt, deleted_at: r.deletedAt }));
      try {
        await rpc('upsert_records', { p_band: bandId, p_records: payload });
      } catch (e) {
        throw asRemoteError(e as DbError);
      }
    },
    async pull(bandId, afterSeq, limit) {
      try {
        const rows = await select<RecordRow[]>((db) =>
          db.from('records').select('kind,id,band_id,data,updated_at,deleted_at,seq')
            .eq('band_id', bandId).gt('seq', afterSeq).order('seq', { ascending: true }).limit(limit),
        );
        return rows.map(fromRow);
      } catch (e) {
        throw asRemoteError(e as DbError);
      }
    },
    subscribe(bandId, onRecord, onState) {
      let stopped = false;
      let cleanup: (() => void) | null = null;
      void client().then((db) => {
        if (stopped) return;
        const channel = db
          .channel(`records:${bandId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `band_id=eq.${bandId}` }, (payload) => {
            if (payload.new && 'kind' in payload.new) onRecord(fromRow(payload.new as RecordRow));
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') onState('live');
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') onState('down');
          });
        cleanup = () => void db.removeChannel(channel);
      });
      return () => {
        stopped = true;
        cleanup?.();
      };
    },
  };

  return {
    remote,

    async currentUser() {
      const { data } = await (await client()).auth.getSession();
      return asUser(data.session?.user);
    },
    onAuthChange(listener) {
      let stop: (() => void) | null = null;
      let cancelled = false;
      void client().then((db) => {
        if (cancelled) return;
        const { data } = db.auth.onAuthStateChange((_event, session) => listener(asUser(session?.user)));
        stop = () => data.subscription.unsubscribe();
      });
      return () => {
        cancelled = true;
        stop?.();
      };
    },
    async signIn(email, password) {
      const { error } = await (await client()).auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new CloudError(NETWORK.test(error.message) ? 'network' : 'auth', error.message);
    },
    async signUp(email, password) {
      const { data, error } = await (await client()).auth.signUp({ email: email.trim(), password });
      if (error) throw new CloudError(NETWORK.test(error.message) ? 'network' : 'auth', error.message);
      return { confirmEmail: data.session === null };
    },
    async signOut() {
      await (await client()).auth.signOut();
    },

    async createBand(id, name) {
      await rpc('create_band', { p_id: id, p_name: name });
    },
    async bandName(bandId) {
      const rows = await select<{ name: string }[]>((db) => db.from('bands').select('name').eq('id', bandId).limit(1));
      return rows[0]?.name ?? null;
    },
    async myRole(bandId) {
      return (await rpc<string | null>('member_role', { p_band: bandId })) as CloudRole | null;
    },
    async members(bandId) {
      const rows = await select<{ user_id: string; email: string; role: CloudRole }[]>((db) =>
        db.from('members').select('user_id,email,role').eq('band_id', bandId).order('joined_at', { ascending: true }),
      );
      return rows.map((r): RemoteMember => ({ userId: r.user_id, email: r.email, role: r.role }));
    },
    async invitations(bandId) {
      const rows = await select<
        { id: string; role: InviteRole; email: string | null; token: string; expires_at: string; accepted_at: string | null; revoked_at: string | null }[]
      >((db) =>
        db.from('invitations').select('id,role,email,token,expires_at,accepted_at,revoked_at').eq('band_id', bandId)
          .order('created_at', { ascending: false }),
      );
      const now = Date.now();
      return rows.map((r): RemoteInvitation => {
        const expiresAt = Date.parse(r.expires_at);
        return {
          id: r.id, role: r.role, email: r.email, token: r.token, expiresAt,
          open: r.accepted_at === null && r.revoked_at === null && expiresAt > now,
        };
      });
    },
    async createInvitation(bandId, role, email) {
      return rpc<string>('create_invitation', { p_band: bandId, p_role: role, p_email: email?.trim() || null });
    },
    async revokeInvitation(id) {
      await rpc('revoke_invitation', { p_id: id });
    },
    async setMemberRole(bandId, userId, role) {
      await rpc('set_member_role', { p_band: bandId, p_user: userId, p_role: role });
    },
    async removeMember(bandId, userId) {
      await rpc('remove_member', { p_band: bandId, p_user: userId });
    },
    async leaveBand(bandId) {
      await rpc('leave_band', { p_band: bandId });
    },
    async previewInvitation(token) {
      const rows = await rpc<{ band_name: string | null; role: InviteRole | null; email_bound: boolean; status: InvitationStatus }[]>(
        'invitation_preview', { p_token: token },
      );
      const row = rows[0];
      const preview: InvitationPreview = row
        ? { bandName: row.band_name, role: row.role, emailBound: row.email_bound, status: row.status }
        : { bandName: null, role: null, emailBound: false, status: 'not_found' };
      return preview;
    },
    async acceptInvitation(token) {
      return rpc<string>('accept_invitation', { p_token: token });
    },
  };
}
