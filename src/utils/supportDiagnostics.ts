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
