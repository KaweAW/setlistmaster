import { FakeRemote } from '../../sync/__tests__/fakeRemote';
import {
  CloudError, type CloudApi, type CloudRole, type CloudUser, type InvitationPreview, type InviteRole,
  type RemoteInvitation, type RemoteMember,
} from '../types';

interface Invite extends RemoteInvitation {
  bandId: string;
  status: 'open' | 'revoked' | 'used';
}

/** An in-memory server with the same rules as the SQL (creator-only actions, one-use invitations, email-bound ones). */
export class FakeCloudServer {
  readonly remote = new FakeRemote();
  readonly bands = new Map<string, string>();
  readonly members = new Map<string, RemoteMember[]>();
  readonly invites: Invite[] = [];
  private n = 0;

  /** The API as seen by one signed-in person (or `null` for a signed-out visitor). */
  as(user: CloudUser | null): CloudApi & { signedIn: CloudUser | null } {
    const server = this; // eslint-disable-line @typescript-eslint/no-this-alias -- the API object's methods need the server, not themselves
    let current = user;
    const listeners = new Set<(u: CloudUser | null) => void>();
    const roleOf = (bandId: string): CloudRole | null => server.members.get(bandId)?.find((m) => m.userId === current?.id)?.role ?? null;
    const needCreator = (bandId: string) => {
      if (roleOf(bandId) !== 'creator') throw new CloudError('creator_only', 'creator_only');
    };
    const api: CloudApi & { signedIn: CloudUser | null } = {
      get signedIn() { return current; },
      remote: server.remote,
      async currentUser() { return current; },
      onAuthChange(l) { listeners.add(l); return () => void listeners.delete(l); },
      async signIn(email) { current = { id: `u-${email}`, email }; listeners.forEach((l) => l(current)); },
      async signUp(email) { current = { id: `u-${email}`, email }; listeners.forEach((l) => l(current)); return { confirmEmail: false }; },
      async signOut() { current = null; listeners.forEach((l) => l(null)); },
      async createBand(id, name) {
        server.bands.set(id, name);
        server.members.set(id, [{ userId: current!.id, email: current!.email, role: 'creator' }]);
      },
      async bandName(id) { return server.bands.get(id) ?? null; },
      async myRole(id) { return roleOf(id); },
      async members(id) { return [...(server.members.get(id) ?? [])]; },
      async invitations(id) { needCreator(id); return server.invites.filter((i) => i.bandId === id); },
      async createInvitation(bandId, role: InviteRole, email) {
        needCreator(bandId);
        const token = `tok${++server.n}`;
        server.invites.push({ id: `inv${server.n}`, bandId, role, email: email?.trim() || null, token, expiresAt: Date.now() + 7 * 864e5, open: true, status: 'open' });
        return token;
      },
      async revokeInvitation(id) {
        const i = server.invites.find((x) => x.id === id)!;
        needCreator(i.bandId);
        i.status = 'revoked';
        i.open = false;
      },
      async setMemberRole(bandId, userId, role) {
        needCreator(bandId);
        server.members.get(bandId)!.find((m) => m.userId === userId)!.role = role;
      },
      async removeMember(bandId, userId) {
        needCreator(bandId);
        server.members.set(bandId, server.members.get(bandId)!.filter((m) => m.userId !== userId));
      },
      async leaveBand(bandId) {
        if (roleOf(bandId) === 'creator') throw new CloudError('creator_cannot_leave', 'creator_cannot_leave');
        server.members.set(bandId, server.members.get(bandId)!.filter((m) => m.userId !== current?.id));
      },
      async previewInvitation(token): Promise<InvitationPreview> {
        const i = server.invites.find((x) => x.token === token);
        if (!i) return { bandName: null, role: null, emailBound: false, status: 'not_found' };
        return { bandName: server.bands.get(i.bandId)!, role: i.role, emailBound: i.email !== null, status: i.status === 'open' ? 'ok' : i.status };
      },
      async acceptInvitation(token) {
        const i = server.invites.find((x) => x.token === token);
        if (!i) throw new CloudError('invitation_not_found', 'x');
        if (i.status === 'revoked') throw new CloudError('invitation_revoked', 'x');
        if (i.status === 'used') throw new CloudError('invitation_used', 'x');
        if (i.email && i.email !== current!.email) throw new CloudError('invitation_wrong_email', 'x');
        server.members.get(i.bandId)!.push({ userId: current!.id, email: current!.email, role: i.role });
        i.status = 'used';
        i.open = false;
        return i.bandId;
      },
    };
    return api;
  }
}
