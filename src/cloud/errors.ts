import type { MessageKey } from '../i18n';
import { CloudError } from './types';

/** The sentence to show for a failed cloud action. */
export function errorMessageKey(error: unknown): MessageKey {
  const code = error instanceof CloudError ? error.code : 'other';
  switch (code) {
    case 'network': return 'cloud.networkError';
    case 'auth': return 'cloud.authError';
    case 'creator_only': return 'cloud.creatorOnly';
    case 'invitation_wrong_email': return 'join.error.invitation_wrong_email';
    case 'invitation_expired': return 'join.status.expired';
    case 'invitation_revoked': return 'join.status.revoked';
    case 'invitation_used': return 'join.status.used';
    case 'invitation_not_found': return 'join.status.not_found';
    default: return 'cloud.otherError';
  }
}
