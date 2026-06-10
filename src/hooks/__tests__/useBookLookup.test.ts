import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBookLookup, clearLookupCache } from '../useBookLookup';

vi.mock('../../store/useAnalyticsStore', () => ({
  useAnalyticsStore: { getState: () => ({ track: vi.fn() }) },
}));
vi.mock('../../lib/errorMonitoring', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

const googleResponse = (overrides: Record<string, unknown> = {}) => ({
  totalItems: 1,
  items: [{ volumeInfo: { title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], pageCount: 180, imageLinks: { thumbnail: 'https://example.com/cover.jpg' }, ...overrides } }],
});

const openLibEntry = (isbn: string, overrides: Record<string, unknown> = {}) => ({
  [`ISBN:${isbn}`]: {
    title: 'The Great Gatsby (OL)', authors: [{ name: 'F. Scott Fitzgerald' }],
    number_of_pages: 182, cover: { medium: 'https://ol.example.com/cover.jpg' }, ...overrides,
  },
});

// Simulates a non-retryable failure (status 400) — no delays, instant null from both APIs
const failFetch = { ok: false, status: 400, json: () => Promise.reject(new Error('bad json')) };

beforeEach(() => {
  vi.restoreAllMocks();
  clearLookupCache();
});

describe('useBookLookup', () => {
  it('returns book metadata on successful lookup', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(googleResponse()) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) }),
    );
    const { result } = renderHook(() => useBookLookup());
    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => { metadata = await result.current.lookupByIsbn('1111111111'); });
    expect(metadata!.title).toBe('The Great Gatsby');
    expect(metadata!.isbn).toBe('1111111111');
    expect(metadata!.source).toBe('google_books');
  });

  it('reports open_library source when Google Books returns nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('googleapis.com')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ totalItems: 0 }) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          'ISBN:5555555555': {
            title: 'Open Library Result',
            authors: [{ name: 'Some Author' }],
            number_of_pages: 200,
          },
        }),
      });
    }));

    const { result } = renderHook(() => useBookLookup());

    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => {
      metadata = await result.current.lookupByIsbn('5555555555');
    });

    expect(metadata!).not.toBeNull();
    expect(metadata!.source).toBe('open_library');
  });

  it('returns null when no book found on any source', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ totalItems: 0 }) }),
    );
    const { result } = renderHook(() => useBookLookup());
    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => { metadata = await result.current.lookupByIsbn('2222222222'); });
    expect(metadata).toBeNull();
    expect(result.current.error).toBe('No book found with this ISBN');
  });

  it('handles fetch errors gracefully (non-retryable status 400)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(failFetch));
    const { result } = renderHook(() => useBookLookup());
    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => { metadata = await result.current.lookupByIsbn('3333333333'); });
    expect(metadata).toBeNull();
    // json() rejection causes both APIs to throw → treated as network failure
    expect(result.current.error).toBe('Failed to fetch book metadata');
  });

  it('handles network-level fetch rejection', async () => {
    vi.stubGlobal('fetch', vi.fn()
      // Fail all retries with a throw — add timeout because retries have real delays
      .mockRejectedValue(new Error('Network error')),
    );
    const { result } = renderHook(() => useBookLookup());
    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => { metadata = await result.current.lookupByIsbn('3131313131'); });
    expect(metadata).toBeNull();
    expect(result.current.error).toBe('Failed to fetch book metadata');
  }, 20000);

  it('returns cached result on second call without fetching again', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(googleResponse()) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useBookLookup());
    await act(async () => { await result.current.lookupByIsbn('4444444444'); });
    fetchMock.mockClear();
    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => { metadata = await result.current.lookupByIsbn('4444444444'); });
    expect(metadata!.title).toBe('The Great Gatsby');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('populates metadataConflicts when both APIs return differing authors', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(googleResponse({ authors: ['Fitzgerald, F. Scott'] })) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(openLibEntry('5555555555')) }),
    );
    const { result } = renderHook(() => useBookLookup());
    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => { metadata = await result.current.lookupByIsbn('5555555555'); });
    expect(metadata!.metadataConflicts).toBeDefined();
    expect(metadata!.metadataConflicts!.some(c => c.field === 'author')).toBe(true);
  });

  it('returns no conflicts when both APIs agree on all fields', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(googleResponse()) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({
        'ISBN:6666666666': { title: 'The Great Gatsby', authors: [{ name: 'F. Scott Fitzgerald' }], number_of_pages: 180 },
      }) }),
    );
    const { result } = renderHook(() => useBookLookup());
    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => { metadata = await result.current.lookupByIsbn('6666666666'); });
    expect(metadata!.metadataConflicts).toBeUndefined();
  });

  it('retries on 500 server error and succeeds on second attempt', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      calls++;
      if (calls === 1) return Promise.resolve({ ok: false, status: 503 });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(calls <= 3 ? googleResponse() : {}) });
    }));
    const { result } = renderHook(() => useBookLookup());
    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => { metadata = await result.current.lookupByIsbn('7777777777'); });
    expect(metadata).not.toBeNull();
  }, 15000);

  it('falls back to alternate ISBN format when primary lookup fails', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      // First two calls (allSettled for primary ISBN) return nothing
      if (callCount <= 2) return Promise.resolve({ ok: true, json: () => Promise.resolve({ totalItems: 0 }) });
      // Subsequent calls (alt format) return Google Books data
      return Promise.resolve({ ok: true, json: () => Promise.resolve(googleResponse()) });
    }));
    const { result } = renderHook(() => useBookLookup());
    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => { metadata = await result.current.lookupByIsbn('9780141036144'); });
    expect(metadata).not.toBeNull();
    // isbn is normalised back to the requested ISBN-13
    expect(metadata!.isbn).toBe('9780141036144');
  });

  it('handles malformed Google Books response (missing items array)', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ totalItems: 1 }) }) // items missing
      // Fallback for all remaining calls (Open Library + any alt-format retries)
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }),
    );
    const { result } = renderHook(() => useBookLookup());
    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => { metadata = await result.current.lookupByIsbn('8888888888'); });
    expect(metadata).toBeNull();
    expect(result.current.error).toBe('No book found with this ISBN');
  });

  it('loading state is true during fetch and false after', async () => {
    let resolveGoogle!: (v: unknown) => void;
    vi.stubGlobal('fetch', vi.fn()
      .mockReturnValueOnce(new Promise(r => { resolveGoogle = r; }))
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) }),
    );
    const { result } = renderHook(() => useBookLookup());
    let lookupPromise!: Promise<unknown>;
    act(() => { lookupPromise = result.current.lookupByIsbn('9999999999'); });
    expect(result.current.loading).toBe(true);
    resolveGoogle({ ok: true, json: () => Promise.resolve({ totalItems: 0 }) });
    await act(async () => { await lookupPromise; });
    expect(result.current.loading).toBe(false);
  });

  describe('refreshMetadata', () => {
    const fakeBook = {
      id: 'b1', isbn: '1212121212', title: 'Old Title', author: 'Old Author',
      pageCount: 100, amazonLink: '', coverImg: '', status: 'to-read' as const,
      notes: '', dateAdded: '', shelfIds: [],
    };

    it('returns fresh metadata for a known book', async () => {
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(googleResponse()) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) }),
      );
      const { result } = renderHook(() => useBookLookup());
      let metadata: Awaited<ReturnType<typeof result.current.refreshMetadata>>;
      await act(async () => { metadata = await result.current.refreshMetadata(fakeBook); });
      expect(metadata).not.toBeNull();
      expect(metadata!.title).toBe('The Great Gatsby');
    });

    it('sets error and returns null when refresh finds nothing', async () => {
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValue({ ok: true, json: () => Promise.resolve({ totalItems: 0 }) }),
      );
      const { result } = renderHook(() => useBookLookup());
      let metadata: Awaited<ReturnType<typeof result.current.refreshMetadata>>;
      await act(async () => { metadata = await result.current.refreshMetadata({ ...fakeBook, isbn: '0000000000' }); });
      expect(metadata).toBeNull();
      expect(result.current.error).toBe('No book found with this ISBN');
    });
  });
});
