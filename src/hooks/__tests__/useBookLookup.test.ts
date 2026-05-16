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

const mockOpenLibraryEmptyResponse = {};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useBookLookup', () => {
  it('returns book metadata on successful lookup', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('googleapis.com')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockApiResponse) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockOpenLibraryEmptyResponse) });
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
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('googleapis.com')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ totalItems: 0 }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockOpenLibraryEmptyResponse) });
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
      metadata = await result.current.lookupByIsbn('3333333333');
    });

    expect(metadata).toBeNull();
    expect(result.current.error).toBe('Failed to fetch book metadata');
  });

  it('returns cached result on second call', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('googleapis.com')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockApiResponse) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockOpenLibraryEmptyResponse) });
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

  it('reports conflicts when providers disagree materially', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('googleapis.com')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockApiResponse) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          'ISBN:6666666666': {
            title: 'A Different Gatsby',
            authors: [{ name: 'Another Author' }],
            number_of_pages: 260,
          },
        }),
      });
    }));

    const { result } = renderHook(() => useBookLookup());

    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => {
      metadata = await result.current.lookupByIsbn('6666666666');
    });

    expect(metadata?.source).toBe('google_books');
    expect(metadata?.conflicts?.[0]).toMatchObject({
      source: 'open_library',
      reasons: expect.arrayContaining(['title', 'author', 'page count']),
    });
  });

  it('uses alternate ISBN edition lookup when the requested form is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('9780306406157')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ totalItems: 0 }) });
      }
      if (url.includes('0306406152')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockApiResponse) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockOpenLibraryEmptyResponse) });
    }));

    const { result } = renderHook(() => useBookLookup());

    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => {
      metadata = await result.current.lookupByIsbn('9780306406157');
    });

    expect(metadata?.isbn).toBe('9780306406157');
    expect(metadata?.matchedIsbn).toBe('0306406152');
    expect(metadata?.editionFallback).toBe(true);
  });
});
