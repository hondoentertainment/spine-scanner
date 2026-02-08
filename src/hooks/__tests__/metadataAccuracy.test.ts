import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBookLookup } from '../useBookLookup';

/**
 * ─── 1b. The Re-issue Paradox ────────────────────────────────────
 *
 * When scanning an older edition of a classic (e.g. a 1990s paperback
 * of The Great Gatsby), the metadata pipeline must return the page
 * count of THAT specific edition — not a modern 2024 hardcover reprint.
 *
 * This is validated by ensuring:
 *   1. The ISBN sent to Google Books matches the scanned ISBN exactly
 *   2. The returned metadata faithfully mirrors the API response
 *      (edition-specific page count, title, authors)
 *   3. If Google Books fails, Open Library is tried as a fallback
 */

// Specific edition: 1990s Penguin Classics paperback of The Great Gatsby
const PENGUIN_1990s_ISBN = '9780141182636';
const PENGUIN_1990s_RESPONSE = {
  totalItems: 1,
  items: [{
    volumeInfo: {
      title: 'The Great Gatsby',
      authors: ['F. Scott Fitzgerald'],
      pageCount: 188, // 1990s Penguin paperback — NOT the 2024 hardcover (218 pages)
      imageLinks: { thumbnail: 'https://books.google.com/penguin-1990s.jpg' },
    },
  }],
};

// Modern Scribner hardcover edition
const SCRIBNER_2024_ISBN = '9780743273565';
const SCRIBNER_2024_RESPONSE = {
  totalItems: 1,
  items: [{
    volumeInfo: {
      title: 'The Great Gatsby',
      authors: ['F. Scott Fitzgerald'],
      pageCount: 218, // 2024 Scribner hardcover
      imageLinks: { thumbnail: 'https://books.google.com/scribner-2024.jpg' },
    },
  }],
};

// Open Library fallback response shape
const OL_RARE_EDITION_RESPONSE = {
  'ISBN:9780684801520': {
    title: 'The Great Gatsby',
    authors: [{ name: 'F. Scott Fitzgerald' }],
    number_of_pages: 182,
    cover: { medium: 'https://covers.openlibrary.org/b/id/rare.jpg' },
  },
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('The Re-issue Paradox — edition-specific metadata', () => {
  it('returns the 1990s paperback page count, not the 2024 hardcover', async () => {
    // Mock: Google Books returns edition-specific data keyed by ISBN
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes(PENGUIN_1990s_ISBN)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(PENGUIN_1990s_RESPONSE),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ totalItems: 0 }),
      });
    }));

    const { result } = renderHook(() => useBookLookup());

    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => {
      metadata = await result.current.lookupByIsbn(PENGUIN_1990s_ISBN);
    });

    expect(metadata).not.toBeNull();
    expect(metadata!.pageCount).toBe(188); // Edition-specific
    expect(metadata!.pageCount).not.toBe(218); // NOT the modern hardcover
    expect(metadata!.isbn).toBe(PENGUIN_1990s_ISBN);
  });

  it('two different ISBNs for the same book return different page counts', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes(PENGUIN_1990s_ISBN)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(PENGUIN_1990s_RESPONSE),
        });
      }
      if (url.includes(SCRIBNER_2024_ISBN)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(SCRIBNER_2024_RESPONSE),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ totalItems: 0 }),
      });
    }));

    const { result } = renderHook(() => useBookLookup());

    let penguinMeta: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    let scribnerMeta: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;

    await act(async () => {
      penguinMeta = await result.current.lookupByIsbn(PENGUIN_1990s_ISBN);
    });
    await act(async () => {
      scribnerMeta = await result.current.lookupByIsbn(SCRIBNER_2024_ISBN);
    });

    // Same book, different editions, different page counts
    expect(penguinMeta!.title).toBe('The Great Gatsby');
    expect(scribnerMeta!.title).toBe('The Great Gatsby');
    expect(penguinMeta!.pageCount).toBe(188);
    expect(scribnerMeta!.pageCount).toBe(218);
    expect(penguinMeta!.pageCount).not.toBe(scribnerMeta!.pageCount);
  });

  it('falls back to Open Library when Google Books has no results for a rare edition', async () => {
    const rareIsbn = '9780684801520'; // Rare Scribner first edition

    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      callCount++;
      if (url.includes('googleapis.com')) {
        // Google Books returns nothing for this rare edition
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ totalItems: 0 }),
        });
      }
      if (url.includes('openlibrary.org')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(OL_RARE_EDITION_RESPONSE),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    }));

    const { result } = renderHook(() => useBookLookup());

    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => {
      metadata = await result.current.lookupByIsbn(rareIsbn);
    });

    // Should have tried both APIs
    expect(callCount).toBeGreaterThanOrEqual(2);
    // Should return Open Library data
    expect(metadata).not.toBeNull();
    expect(metadata!.pageCount).toBe(182);
    expect(metadata!.isbn).toBe(rareIsbn);
  });

  it('sends the exact scanned ISBN to the API (no normalization that would lose edition)', async () => {
    // Use a unique ISBN not used in other tests to avoid cache hits
    const uniqueIsbn = '9780140449136';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        totalItems: 1,
        items: [{
          volumeInfo: {
            title: 'Test Book',
            authors: ['Test Author'],
            pageCount: 100,
            imageLinks: { thumbnail: '' },
          },
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBookLookup());

    await act(async () => {
      await result.current.lookupByIsbn(uniqueIsbn);
    });

    // Verify the API was called with the exact ISBN
    expect(fetchMock).toHaveBeenCalled();
    const firstCallUrl = fetchMock.mock.calls[0][0] as string;
    expect(firstCallUrl).toContain(uniqueIsbn);
  });

  it('handles API returning 0 page count for unknown editions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        totalItems: 1,
        items: [{
          volumeInfo: {
            title: 'Obscure Chapbook',
            authors: ['Unknown Author'],
            // No pageCount field at all
            imageLinks: {},
          },
        }],
      }),
    }));

    const { result } = renderHook(() => useBookLookup());

    let metadata: Awaited<ReturnType<typeof result.current.lookupByIsbn>>;
    await act(async () => {
      metadata = await result.current.lookupByIsbn('9999999999');
    });

    expect(metadata).not.toBeNull();
    expect(metadata!.pageCount).toBe(0); // Defaults to 0, not undefined
  });
});
