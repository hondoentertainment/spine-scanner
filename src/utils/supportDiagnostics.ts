export interface SupportDiagnosticsInput {
  release: string;
  environment: string;
  basePath: string;
  siteUrl: string | null;
  online: boolean;
  hasUser: boolean;
  pendingChanges: number;
  lastSyncedAt: string | null;
  lastSyncFailedAt: number | null;
  monitoringEnabled: boolean;
  supabaseConfigured: boolean;
  totalBooks: number;
  totalShelves: number;
  reviewCount: number;
  currentView: string;
  generatedAt?: string;
  userAgent?: string;
  language?: string;
}

export interface SupportDiagnosticsSnapshot {
  generatedAt: string;
  app: {
    name: 'SpineScanner';
    release: string;
    environment: string;
    basePath: string;
    siteUrl: string | null;
    currentView: string;
  };
  runtime: {
    online: boolean;
    hasUser: boolean;
    userAgent: string;
    language: string;
  };
  services: {
    monitoringEnabled: boolean;
    supabaseConfigured: boolean;
  };
  sync: {
    pendingChanges: number;
    lastSyncedAt: string | null;
    lastSyncFailedAt: number | null;
  };
  library: {
    totalBooks: number;
    totalShelves: number;
    reviewCount: number;
  };
}

export function buildSupportDiagnostics(input: SupportDiagnosticsInput): SupportDiagnosticsSnapshot {
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    app: {
      name: 'SpineScanner',
      release: input.release,
      environment: input.environment,
      basePath: input.basePath,
      siteUrl: input.siteUrl,
      currentView: input.currentView,
    },
    runtime: {
      online: input.online,
      hasUser: input.hasUser,
      userAgent: input.userAgent ?? 'unknown',
      language: input.language ?? 'unknown',
    },
    services: {
      monitoringEnabled: input.monitoringEnabled,
      supabaseConfigured: input.supabaseConfigured,
    },
    sync: {
      pendingChanges: input.pendingChanges,
      lastSyncedAt: input.lastSyncedAt,
      lastSyncFailedAt: input.lastSyncFailedAt,
    },
    library: {
      totalBooks: input.totalBooks,
      totalShelves: input.totalShelves,
      reviewCount: input.reviewCount,
    },
  };
}

export function serializeSupportDiagnostics(snapshot: SupportDiagnosticsSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

// ---- Diagnostics bundle download ----

import type { BookEntry, ProfilePreferences } from '../types.ts';
import type { AnalyticsEvent } from '../store/useAnalyticsStore.ts';

/** Keys containing these substrings are redacted from the localStorage dump. */
const SENSITIVE_KEY_PATTERNS = ['password', 'token', 'key'];

function isSensitiveKey(k: string): boolean {
  const lower = k.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((p) => lower.includes(p));
}

function collectLocalStorage(): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k !== null && !isSensitiveKey(k)) {
        result[k] = localStorage.getItem(k) ?? '';
      }
    }
  } catch {
    // localStorage unavailable
  }
  return result;
}

/**
 * Assembles a diagnostics bundle and triggers a browser download.
 * The bundle contains book count, preferences, last 100 analytics events,
 * and a filtered localStorage snapshot (sensitive keys excluded).
 */
export function downloadDiagnosticsBundle(
  books: BookEntry[],
  preferences: ProfilePreferences,
  analyticsEvents: AnalyticsEvent[],
): void {
  const bundle = {
    generatedAt: new Date().toISOString(),
    books: books.length,
    preferences,
    analyticsEvents: analyticsEvents.slice(0, 100),
    localStorage: collectLocalStorage(),
  };

  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  a.href = url;
  a.download = `spinescanner-diagnostics-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
