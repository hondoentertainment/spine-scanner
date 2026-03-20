import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBookLookup } from '../useBookLookup';

const googleBooksResponse = {
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

const openLibraryResponse = {
  'ISBN:9780140283334': {
    title: 'On the Road',
    authors: [{ name: 'Jack Kerouac' }],
    number_of_pages: 320,
    cover: { medium: 'https://covers.openlibrary.org/cover.jpg' },
  },
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useBookLookup – metadata source tracking', () => {
  it('returns source: google_books when Google Books succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(googleBooksResponse),
    }));

    const { result } = renderHook(() => useBookLookup());

    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => {
      metadata = await result.current.lookupByIsbn('5555555555');
    });

    expect(metadata!).not.toBeNull();
    expect(metadata!.source).toBe('google_books');
  });

  it('returns source: open_library when falling back to Open Library', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      // First call (Google Books) returns no results
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ totalItems: 0 }),
        });
      }
      // Second call (Open Library) returns results
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(openLibraryResponse),
      });
    }));

    const { result } = renderHook(() => useBookLookup());

    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => {
      metadata = await result.current.lookupByIsbn('9780140283334');
    });

    expect(metadata!).not.toBeNull();
    expect(metadata!.source).toBe('open_library');
    expect(metadata!.title).toBe('On the Road');
  });

  it('refreshMetadata bypasses cache and re-fetches', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(googleBooksResponse),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBookLookup());

    // Initial lookup
    await act(async () => {
      await result.current.lookupByIsbn('6666666666');
    });
    const firstCallCount = fetchMock.mock.calls.length;

    // Refresh should make new fetch calls (not use cache)
    let refreshed: Awaited<ReturnType<typeof result.current.refreshMetadata>>;
    await act(async () => {
      refreshed = await result.current.refreshMetadata('6666666666');
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThan(firstCallCount);
    expect(refreshed!).not.toBeNull();
    expect(refreshed!.title).toBe('The Great Gatsby');
    expect(refreshed!.source).toBe('google_books');
  });

  it('refreshMetadata returns null when no metadata found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ totalItems: 0 }),
    }));

    const { result } = renderHook(() => useBookLookup());

    let refreshed: Awaited<ReturnType<typeof result.current.refreshMetadata>>;
    await act(async () => {
      refreshed = await result.current.refreshMetadata('0000000000');
    });

    expect(refreshed).toBeNull();
    expect(result.current.error).toBe('No metadata found for refresh');
  });

  it('refreshMetadata handles network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const { result } = renderHook(() => useBookLookup());

    let refreshed: Awaited<ReturnType<typeof result.current.refreshMetadata>>;
    await act(async () => {
      refreshed = await result.current.refreshMetadata('7777777777');
    });

    expect(refreshed).toBeNull();
    expect(result.current.error).toBe('Failed to refresh metadata');
  });
});
