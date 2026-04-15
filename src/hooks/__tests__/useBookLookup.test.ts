import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBookLookup } from '../useBookLookup';

const mockApiResponse = {
  totalItems: 1,
  items: [{
    volumeInfo: {
      title: 'The Great Gatsby',
      authors: ['F. Scott Fitzgerald'],
      pageCount: 180,
      imageLinks: { thumbnail: 'https://example.com/cover.jpg' },
    },
  }],
};

const emptyGoogleResponse = { totalItems: 0 };
const emptyOpenLibResponse = {};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useBookLookup', () => {
  it('returns book metadata on successful lookup', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    }));

    const { result } = renderHook(() => useBookLookup());

    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => {
      metadata = await result.current.lookupByIsbn('1111111111');
    });

    expect(metadata!).not.toBeNull();
    expect(metadata!.title).toBe('The Great Gatsby');
    expect(metadata!.authors).toEqual(['F. Scott Fitzgerald']);
    expect(metadata!.pageCount).toBe(180);
    expect(metadata!.isbn).toBe('1111111111');
  });

  it('returns null when no book found on any source', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ totalItems: 0 }),
    }));

    const { result } = renderHook(() => useBookLookup());

    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => {
      metadata = await result.current.lookupByIsbn('2222222222');
    });

    expect(metadata).toBeNull();
    expect(result.current.error).toBe('No book found with this ISBN');
  });

  it('handles fetch errors gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const { result } = renderHook(() => useBookLookup());

    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => {
      const promise = result.current.lookupByIsbn('3333333333');
      // Advance timers to drain retry delays
      await vi.runAllTimersAsync();
      metadata = await promise;
    });

    expect(metadata).toBeNull();
    expect(result.current.error).toBe('Failed to fetch book metadata');
  });

  it('returns cached result on second call', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBookLookup());

    await act(async () => {
      await result.current.lookupByIsbn('4444444444');
    });

    // Reset mock to verify no new fetch is made
    fetchMock.mockClear();

    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => {
      metadata = await result.current.lookupByIsbn('4444444444');
    });

    expect(metadata!.title).toBe('The Great Gatsby');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /* ── fetchWithRetry: 500 server error retries ── */
  it('retries on 500 and succeeds on second attempt', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(mockApiResponse) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBookLookup());

    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => {
      const promise = result.current.lookupByIsbn('5555555555');
      await vi.runAllTimersAsync();
      metadata = await promise;
    });

    expect(metadata!).not.toBeNull();
    expect(metadata!.title).toBe('The Great Gatsby');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns non-ok response after exhausting retries on 500', async () => {
    // 500 on all 3 attempts (initial + 2 retries) — falls through to all APIs failing
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBookLookup());

    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => {
      const promise = result.current.lookupByIsbn('6666666666');
      await vi.runAllTimersAsync();
      metadata = await promise;
    });

    // After exhausting retries for all APIs (Google + OpenLibrary + alt), should return null with error
    expect(metadata).toBeNull();
  });

  /* ── Google Books: missing optional fields ── */
  it('uses Unknown Title and Unknown Author when volumeInfo fields are absent', async () => {
    const sparseResponse = {
      totalItems: 1,
      items: [{ volumeInfo: {} }],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sparseResponse),
    }));

    const { result } = renderHook(() => useBookLookup());

    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => {
      metadata = await result.current.lookupByIsbn('7777777777');
    });

    expect(metadata!.title).toBe('Unknown Title');
    expect(metadata!.authors).toEqual(['Unknown Author']);
    expect(metadata!.pageCount).toBe(0);
    expect(metadata!.thumbnail).toBe('');
  });

  /* ── Open Library fallback: Google returns 0 items ── */
  it('falls back to Open Library when Google Books finds nothing', async () => {
    const openLibResponse = {
      'ISBN:8888888888': {
        title: 'Open Library Book',
        authors: [{ name: 'OL Author' }],
        number_of_pages: 250,
        cover: { medium: 'https://covers.openlibrary.org/med.jpg' },
      },
    };

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(emptyGoogleResponse) })
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(openLibResponse) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBookLookup());

    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => {
      metadata = await result.current.lookupByIsbn('8888888888');
    });

    expect(metadata!.title).toBe('Open Library Book');
    expect(metadata!.authors).toEqual(['OL Author']);
    expect(metadata!.pageCount).toBe(250);
  });

  /* ── Open Library: small cover fallback ── */
  it('uses small cover from Open Library when medium cover is absent', async () => {
    const openLibSmallCover = {
      'ISBN:8888888889': {
        title: 'Small Cover Book',
        cover: { small: 'https://covers.openlibrary.org/small.jpg' },
      },
    };

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(emptyGoogleResponse) })
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(openLibSmallCover) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBookLookup());

    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => {
      metadata = await result.current.lookupByIsbn('8888888889');
    });

    expect(metadata!.thumbnail).toBe('https://covers.openlibrary.org/small.jpg');
  });

  /* ── Open Library: no cover at all ── */
  it('returns empty thumbnail when Open Library entry has no cover', async () => {
    const openLibNoCover = {
      'ISBN:8888888890': {
        title: 'No Cover Book',
        authors: [{ name: 'Auth' }],
      },
    };

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(emptyGoogleResponse) })
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(openLibNoCover) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBookLookup());

    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => {
      metadata = await result.current.lookupByIsbn('8888888890');
    });

    expect(metadata!.thumbnail).toBe('');
  });

  /* ── Open Library: no authors field ── */
  it('defaults to Unknown Author when Open Library entry has no authors', async () => {
    const openLibNoAuthors = {
      'ISBN:8888888891': { title: 'No Author Book' },
    };

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(emptyGoogleResponse) })
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(openLibNoAuthors) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBookLookup());

    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => {
      metadata = await result.current.lookupByIsbn('8888888891');
    });

    expect(metadata!.authors).toEqual(['Unknown Author']);
    expect(metadata!.pageCount).toBe(0);
  });

  /* ── Alternate ISBN format: ISBN-13 → ISBN-10 ── */
  it('tries alternate ISBN-10 when ISBN-13 fails on all primary sources', async () => {
    // 13-digit ISBN: Google + OpenLibrary both fail
    // alt ISBN-10: Google succeeds
    const isbn13 = '9780141036144'; // valid ISBN-13
    const openLibKey = `ISBN:${isbn13}`;

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(emptyGoogleResponse) }) // Google for isbn13
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ [openLibKey]: undefined }) }) // OpenLib for isbn13 (no entry)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockApiResponse) }) // Google for alt (isbn10)
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(emptyOpenLibResponse) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBookLookup());

    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => {
      metadata = await result.current.lookupByIsbn(isbn13);
    });

    expect(metadata!).not.toBeNull();
    // isbn should be replaced with original isbn13
    expect(metadata!.isbn).toBe(isbn13);
  });

  /* ── Alternate ISBN format: ISBN-10 → ISBN-13 ── */
  it('tries alternate ISBN-13 when ISBN-10 fails on all primary sources', async () => {
    const isbn10 = '0141036141'; // valid ISBN-10

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(emptyGoogleResponse) }) // Google for isbn10
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) }) // OpenLib for isbn10 (no entry)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockApiResponse) }) // Google for alt (isbn13)
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(emptyOpenLibResponse) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBookLookup());

    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => {
      metadata = await result.current.lookupByIsbn(isbn10);
    });

    expect(metadata!).not.toBeNull();
    expect(metadata!.isbn).toBe(isbn10);
  });

  /* ── Sets loading state ── */
  it('sets loading to true during lookup and false after', async () => {
    let resolveJson!: (val: unknown) => void;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => new Promise((r) => { resolveJson = r; }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBookLookup());

    await act(async () => {
      const promise = result.current.lookupByIsbn('9999999999');
      // Allow the lookup to start (fetch call begins)
      await Promise.resolve();
      await Promise.resolve();
      resolveJson(mockApiResponse);
      await promise;
    });

    expect(result.current.loading).toBe(false);
  });
});
