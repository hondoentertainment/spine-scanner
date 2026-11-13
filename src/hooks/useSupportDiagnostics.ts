import { useMemo } from 'react';
import type { PublicPage } from '../components/PublicInfoPage.tsx';
import { isEnabled as isMonitoringEnabled } from '../lib/errorMonitoring.ts';
import { isSupabaseConfigured } from '../lib/supabase.ts';
import { useAuthStore } from '../store/useAuthStore.ts';
import { useBookStore } from '../store/useBookStore.ts';
import { useSyncQueue } from '../store/useSyncQueue.ts';
import { getLibraryInsights } from '../utils/bookPresentation.ts';
import { buildSupportDiagnostics } from '../utils/supportDiagnostics.ts';
import { APP_ENV, APP_RELEASE, SITE_URL } from '../app/publicPages.ts';

export function useSupportDiagnostics(
  online: boolean,
  pathname: string,
  publicPage: PublicPage | null,
) {
  const { books, shelves } = useBookStore();
  const { user } = useAuthStore();
  const pendingChanges = useSyncQueue((s) => s.pendingChanges);
  const lastSyncedAt = useSyncQueue((s) => s.lastSyncedAt);
  const lastSyncFailedAt = useSyncQueue((s) => s.lastSyncFailedAt);
  const insights = useMemo(() => getLibraryInsights(books), [books]);

  return useMemo(() => buildSupportDiagnostics({
    release: APP_RELEASE,
    environment: APP_ENV,
    basePath: import.meta.env.BASE_URL,
    siteUrl: SITE_URL ?? null,
    online,
    hasUser: Boolean(user?.id),
    pendingChanges,
    lastSyncedAt,
    lastSyncFailedAt,
    monitoringEnabled: isMonitoringEnabled(),
    supabaseConfigured: isSupabaseConfigured(),
    totalBooks: books.length,
    totalShelves: shelves.length,
    reviewCount: insights.reviewCount,
    currentView: publicPage ?? pathname,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    language: typeof navigator !== 'undefined' ? navigator.language : 'unknown',
  }), [books.length, insights.reviewCount, lastSyncFailedAt, lastSyncedAt, pathname, online, pendingChanges, publicPage, shelves.length, user?.id]);
}
