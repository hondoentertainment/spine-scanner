import { useBookStore } from '../store/useBookStore.ts';
import { useProfileStore } from '../store/useProfileStore.ts';
import { useSyncQueue } from '../store/useSyncQueue.ts';
import { useAnalyticsStore } from '../store/useAnalyticsStore.ts';
import { useConsentStore } from '../store/useConsentStore.ts';
import { DEFAULT_PREFERENCES } from '../types.ts';

/** localStorage keys used by zustand persist (reference for support / diagnostics). */
export const SPINE_LOCAL_STORAGE_KEYS = [
  'spine-scanner-storage',
  'spine-scanner-preferences',
  'spine-scanner-sync-queue',
  'spine-scanner-analytics',
  'spine-scanner-consent-v1',
  'spine-library-session',
] as const;

const SPINE_CACHE_NAMES = [
  'google-books-api',
  'openlibrary-api',
  'book-covers',
  'openlibrary-covers',
  'tesseract-core',
  'tesseract-lang',
  'tesseract-local',
  'jsdelivr-cdn',
] as const;

function removeStorageKeys(storage: Storage): void {
  for (const key of SPINE_LOCAL_STORAGE_KEYS) {
    storage.removeItem(key);
  }

  for (const key of Object.keys(storage)) {
    if (key.startsWith('spine-scanner-') || key.startsWith('sb-')) {
      storage.removeItem(key);
    }
  }
}

async function clearAppCaches(): Promise<void> {
  if (!('caches' in window)) return;
  await Promise.all(SPINE_CACHE_NAMES.map((cacheName) => caches.delete(cacheName)));
}

/**
 * Resets library, preferences, sync queue, and analytics in memory and persisted storage (via zustand).
 * Does not sign the user out or delete cloud data.
 */
export async function clearLocalAppData(): Promise<void> {
  useBookStore.setState({ books: [], shelves: [] });
  useProfileStore.setState({ preferences: { ...DEFAULT_PREFERENCES } });
  useSyncQueue.getState().reset();
  useAnalyticsStore.getState().clearAll();
  useConsentStore.getState().reset();
  removeStorageKeys(localStorage);
  removeStorageKeys(sessionStorage);
  await clearAppCaches();
}
