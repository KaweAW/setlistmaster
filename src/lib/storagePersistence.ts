export type Persistence = 'persisted' | 'denied' | 'unsupported';

/**
 * Asks the browser not to delete this site's data when it runs low on space. Safari may clear the data of
 * sites that are rarely opened; an app added to the Home Screen is normally protected.
 */
export async function ensurePersistentStorage(): Promise<Persistence> {
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!storage || typeof storage.persist !== 'function') return 'unsupported';
  try {
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return 'persisted';
    return (await storage.persist()) ? 'persisted' : 'denied';
  } catch {
    return 'denied';
  }
}

export interface StorageUsage {
  used: number;
  quota: number;
}

export async function storageUsage(): Promise<StorageUsage | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    return estimate?.usage !== undefined && estimate.quota !== undefined
      ? { used: estimate.usage, quota: estimate.quota }
      : null;
  } catch {
    return null;
  }
}
