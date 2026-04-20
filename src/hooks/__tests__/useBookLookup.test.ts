import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBookLookup, clearBookLookupCache } from '../useBookLookup.ts';

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

beforeEach(() => {
  vi.restoreAllMocks();
  clearBookLookupCache();
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
      metadata = await result.current.lookupByIsbn('3333333333');
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
});
