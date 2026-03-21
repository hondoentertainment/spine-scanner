import { describe, expect, it } from 'vitest';
import { buildSupportDiagnostics, serializeSupportDiagnostics } from './supportDiagnostics';

describe('supportDiagnostics', () => {
  it('builds a structured diagnostics snapshot', () => {
    const snapshot = buildSupportDiagnostics({
      release: 'abc123',
      environment: 'production',
      basePath: '/spine-scanner/',
      siteUrl: 'https://example.com',
      online: true,
      hasUser: false,
      pendingChanges: 2,
      lastSyncedAt: '2026-03-14T00:00:00.000Z',
      lastSyncFailedAt: null,
      monitoringEnabled: true,
      supabaseConfigured: true,
      totalBooks: 42,
      totalShelves: 5,
      reviewCount: 3,
      currentView: 'library',
      generatedAt: '2026-03-14T01:02:03.000Z',
      userAgent: 'TestAgent/1.0',
      language: 'en-US',
    });

    expect(snapshot.app.release).toBe('abc123');
    expect(snapshot.runtime.userAgent).toBe('TestAgent/1.0');
    expect(snapshot.library.reviewCount).toBe(3);
    expect(snapshot.sync.pendingChanges).toBe(2);
  });

  it('serializes diagnostics as readable JSON', () => {
    const text = serializeSupportDiagnostics(buildSupportDiagnostics({
      release: 'abc123',
      environment: 'production',
      basePath: '/',
      siteUrl: null,
      online: true,
      hasUser: true,
      pendingChanges: 0,
      lastSyncedAt: null,
      lastSyncFailedAt: null,
      monitoringEnabled: false,
      supabaseConfigured: false,
      totalBooks: 1,
      totalShelves: 0,
      reviewCount: 0,
      currentView: 'support',
      generatedAt: '2026-03-14T01:02:03.000Z',
    }));

    expect(text).toContain('"release": "abc123"');
    expect(text).toContain('"name": "SpineScanner"');
  });
});
