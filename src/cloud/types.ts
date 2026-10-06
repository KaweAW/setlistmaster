import type { RemoteClient } from '../sync/engine';

export interface CloudUser {
  id: string;
  email: string;
}

export type CloudRole = 'creator' | 'editor' | 'viewer';
export type InviteRole = 'editor' | 'viewer';

export interface RemoteMember {
  userId: string;
  email: string;
  role: CloudRole;
}

export interface RemoteInvitation {
  id: string;
  role: InviteRole;
  email: string | null;
  token: string;
  expiresAt: number;
  /** Still open: not accepted, not revoked, not expired. */
  open: boolean;
}

export type InvitationStatus = 'ok' | 'expired' | 'revoked' | 'used' | 'not_found';
export interface InvitationPreview {
  bandName: string | null;
  role: InviteRole | null;
  emailBound: boolean;
  status: InvitationStatus;
}

/** Things the server refuses, as the screens need to tell them apart. */
export type CloudErrorCode =
  | 'network' | 'forbidden' | 'creator_only' | 'invitation_wrong_email' | 'invitation_revoked' | 'invitation_used'
  | 'invitation_expired' | 'invitation_not_found' | 'creator_cannot_leave' | 'auth' | 'other';

export class CloudError extends Error {
  constructor(public readonly code: CloudErrorCode, message: string) {
    super(message);
  }
}

/** Everything the app asks of the cloud. Supabase implements it; tests use a fake. */
export interface CloudApi {
  readonly remote: RemoteClient;
  currentUser(): Promise<CloudUser | null>;
  onAuthChange(listener: (user: CloudUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  /** `confirmEmail`: the project asks the person to confirm the address before the first sign in. */
  signUp(email: string, password: string): Promise<{ confirmEmail: boolean }>;
  signOut(): Promise<void>;

  createBand(id: string, name: string): Promise<void>;
  bandName(bandId: string): Promise<string | null>;
  myRole(bandId: string): Promise<CloudRole | null>;
  members(bandId: string): Promise<RemoteMember[]>;
  invitations(bandId: string): Promise<RemoteInvitation[]>;
  createInvitation(bandId: string, role: InviteRole, email?: string): Promise<string>;
  revokeInvitation(id: string): Promise<void>;
  setMemberRole(bandId: string, userId: string, role: InviteRole): Promise<void>;
  removeMember(bandId: string, userId: string): Promise<void>;
  leaveBand(bandId: string): Promise<void>;
  /** The instrument I play in this band, kept on my membership (so it follows me across devices). */
  myInstrument(bandId: string): Promise<string | null>;
  setMyInstrument(bandId: string, instrumentId: string | null): Promise<void>;
  previewInvitation(token: string): Promise<InvitationPreview>;
  acceptInvitation(token: string): Promise<string>;
}
