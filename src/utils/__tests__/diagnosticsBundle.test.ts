import { describe, it, expect, vi, beforeEach } from 'vitest';
import { downloadDiagnosticsBundle } from '../supportDiagnostics';
import type { BookEntry, ProfilePreferences } from '../../types';
import type { AnalyticsEvent } from '../../store/useAnalyticsStore';

// ---- helpers ----

function makeBook(overrides: Partial<BookEntry> = {}): BookEntry {
  return {
    id: 'b1',
    isbn: '9780000000001',
    title: 'Test Book',
    author: 'Test Author',
    pageCount: 300,
    amazonLink: '',
    coverImg: '',
    status: 'read',
    notes: '',
    dateAdded: '2026-01-01T00:00:00.000Z',
    shelfIds: [],
    ...overrides,
  };
}

const defaultPreferences: ProfilePreferences = {
  theme: 'dark',
  librarySortBy: 'dateAdded',
  librarySortAsc: false,
  libraryViewMode: 'grid',
  libraryStatusFilter: 'all',
  batchModeDefault: false,
  showStatsDefault: true,
  showShelvesDefault: false,
  onboardingCompleted: true,
  smartShelves: [],
  savedViews: [],
  readingGoalBooksPerYear: null,
  readingGoalPagesPerYear: null,
  warnOnDuplicateIsbn: true,
  currentStreak: 0,
  longestStreak: 0,
};

function makeEvent(type: AnalyticsEvent['type']): AnalyticsEvent {
  return { type, timestamp: '2026-01-01T00:00:00.000Z' };
}

// ---- tests ----

describe('downloadDiagnosticsBundle', () => {
  let capturedBlob: Blob | null = null;
  let anchorClickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    capturedBlob = null;
    anchorClickSpy = vi.fn();
    vi.unstubAllGlobals();

    // Mock URL methods
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((blob: Blob) => {
        capturedBlob = blob;
        return 'blob:mock-url';
      }),
      revokeObjectURL: vi.fn(),
    });

    // Mock document.createElement to intercept anchor.
    // We must NOT use the spy's own mock recursively, so we save a direct
    // reference to the native method via Object.getOwnPropertyDescriptor
    // before installing the spy, then call it via .call() to avoid recursion.
    const nativeCreateElement = HTMLDocument.prototype.createElement;
    vi.spyOn(document, 'createElement').mockImplementation(function (tag: string, ...rest: unknown[]) {
      if (tag === 'a') {
        const anchor = nativeCreateElement.call(document, 'a');
        anchor.click = anchorClickSpy;
        return anchor;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return nativeCreateElement.call(document, tag, ...(rest as any));
    });

    // Mock localStorage
    const store: Record<string, string> = {
      'spine-scanner-books': '[]',
      'user_password': 'secret',
      'auth_token': 'tok123',
      'api_key': 'key456',
      'spine-scanner-prefs': '{}',
    };
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((k: string) => store[k] ?? null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: Object.keys(store).length,
      key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
    } satisfies Storage);
  });

  it('calls URL.createObjectURL with a Blob', () => {
    downloadDiagnosticsBundle([makeBook()], defaultPreferences, []);
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(capturedBlob).toBeInstanceOf(Blob);
  });

  it('triggers the anchor click to initiate download', () => {
    downloadDiagnosticsBundle([makeBook()], defaultPreferences, []);
    expect(anchorClickSpy).toHaveBeenCalledOnce();
  });

  it('calls URL.revokeObjectURL to clean up after download', () => {
    downloadDiagnosticsBundle([makeBook()], defaultPreferences, []);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('bundle JSON includes books count, preferences, and analyticsEvents', async () => {
    const events = [makeEvent('scan_barcode_success'), makeEvent('book_added')];
    downloadDiagnosticsBundle([makeBook(), makeBook({ id: 'b2' })], defaultPreferences, events);

    expect(capturedBlob).not.toBeNull();
    const text = await capturedBlob!.text();
    const parsed = JSON.parse(text);

    expect(parsed.books).toBe(2);
    expect(parsed.preferences).toMatchObject({ theme: 'dark' });
    expect(parsed.analyticsEvents).toHaveLength(2);
    expect(parsed.analyticsEvents[0].type).toBe('scan_barcode_success');
  });

  it('limits analyticsEvents to the most recent 100', async () => {
    const events = Array.from({ length: 150 }, (_, i) =>
      makeEvent(i % 2 === 0 ? 'scan_barcode_success' : 'book_added')
    );
    downloadDiagnosticsBundle([makeBook()], defaultPreferences, events);

    const text = await capturedBlob!.text();
    const parsed = JSON.parse(text);
    expect(parsed.analyticsEvents).toHaveLength(100);
  });

  it('filters out localStorage keys containing "password", "token", or "key"', async () => {
    downloadDiagnosticsBundle([makeBook()], defaultPreferences, []);

    const text = await capturedBlob!.text();
    const parsed = JSON.parse(text);
    const keys = Object.keys(parsed.localStorage);

    expect(keys).toContain('spine-scanner-books');
    expect(keys).toContain('spine-scanner-prefs');
    expect(keys).not.toContain('user_password');
    expect(keys).not.toContain('auth_token');
    expect(keys).not.toContain('api_key');
  });
});
