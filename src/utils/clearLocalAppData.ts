import { useBookStore } from '../store/useBookStore.ts';
import { useProfileStore } from '../store/useProfileStore.ts';
import { useSyncQueue } from '../store/useSyncQueue.ts';
import { useAnalyticsStore } from '../store/useAnalyticsStore.ts';
import { DEFAULT_PREFERENCES } from '../types.ts';

/** localStorage keys used by zustand persist (reference for support / diagnostics). */
export const SPINE_LOCAL_STORAGE_KEYS = [
  'spine-scanner-storage',
  'spine-scanner-preferences',
  'spine-scanner-sync-queue',
  'spine-scanner-analytics',
] as const;

/**
 * Resets library, preferences, sync queue, and analytics in memory and persisted storage (via zustand).
 * Does not sign the user out or delete cloud data.
 */
export function clearLocalAppData(): void {
  useBookStore.setState({ books: [], shelves: [] });
  useProfileStore.setState({ preferences: { ...DEFAULT_PREFERENCES } });
  useSyncQueue.getState().reset();
  useAnalyticsStore.getState().clearAll();
}
