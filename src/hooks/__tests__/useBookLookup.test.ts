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

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useBookLookup', () => {
  it('returns book metadata on successful lookup', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve(mockApiResponse),
    }));

    const { result } = renderHook(() => useBookLookup());

    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => {
      metadata = await result.current.lookupByIsbn('9780141036144');
    });

    expect(metadata!).not.toBeNull();
    expect(metadata!.title).toBe('The Great Gatsby');
    expect(metadata!.authors).toEqual(['F. Scott Fitzgerald']);
    expect(metadata!.pageCount).toBe(180);
    expect(metadata!.isbn).toBe('9780141036144');
  });

  it('returns null when no book found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ totalItems: 0 }),
    }));

    const { result } = renderHook(() => useBookLookup());

    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => {
      metadata = await result.current.lookupByIsbn('0000000000');
    });

    expect(metadata).toBeNull();
    expect(result.current.error).toBe('No book found with this ISBN');
  });

  it('handles fetch errors gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const { result } = renderHook(() => useBookLookup());

    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => {
      metadata = await result.current.lookupByIsbn('9780141036144');
    });

    expect(metadata).toBeNull();
    expect(result.current.error).toBe('Failed to fetch book metadata');
  });

  it('sets loading state during lookup', async () => {
    let resolvePromise: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(
      new Promise(resolve => { resolvePromise = resolve; })
    ));

    const { result } = renderHook(() => useBookLookup());
    expect(result.current.loading).toBe(false);

    let lookupPromise: Promise<unknown>;
    act(() => {
      lookupPromise = result.current.lookupByIsbn('9780141036144');
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolvePromise!({ json: () => Promise.resolve(mockApiResponse) });
      await lookupPromise;
    });

    expect(result.current.loading).toBe(false);
  });
});
