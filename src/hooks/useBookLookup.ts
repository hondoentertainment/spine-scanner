import { useCallback, useState } from 'react';
import { isbn13To10, isbn10To13 } from '../utils/isbnValidation.ts';
import { addBreadcrumb, captureException } from '../lib/errorMonitoring.ts';
import type { BookLookupResult, BookMetadata, MetadataSource } from '../types.ts';

export type { BookMetadata, BookLookupResult } from '../types.ts';

const cache = new Map<string, BookLookupResult>();

/** Clear in-memory lookup cache (e.g. between tests or after account reset). */
export function clearBookLookupCache(): void {
  cache.clear();
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fetchWithRetry = async (url: string, retries = 2): Promise<Response> => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      if (response.status >= 500 && attempt < retries) {
        await delay(1000 * 2 ** attempt);
        continue;
      }
      return response;
    } catch (err) {
      if (attempt < retries) {
        await delay(1000 * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
};

const lookupGoogleBooks = async (isbn: string): Promise<BookMetadata | null> => {
  const response = await fetchWithRetry(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`
  );
  const data = await response.json();
  if (data.totalItems === 0) return null;

  const volumeInfo = data.items[0].volumeInfo;
  return {
    title: volumeInfo.title || 'Unknown Title',
    authors: volumeInfo.authors || ['Unknown Author'],
    pageCount: volumeInfo.pageCount || 0,
    thumbnail: volumeInfo.imageLinks?.thumbnail || '',
    isbn,
  };
};

const lookupOpenLibrary = async (isbn: string): Promise<BookMetadata | null> => {
  const response = await fetchWithRetry(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`
  );
  const data = await response.json();
  const entry = data[`ISBN:${isbn}`];
  if (!entry) return null;

  return {
    title: entry.title || 'Unknown Title',
    authors: entry.authors?.map((a: { name: string }) => a.name) || ['Unknown Author'],
    pageCount: entry.number_of_pages || 0,
    thumbnail: entry.cover?.medium || entry.cover?.small || '',
    isbn,
  };
};

function buildLookupResult(
  primary: BookMetadata,
  source: MetadataSource,
  google: BookMetadata | null,
  openLibrary: BookMetadata | null,
): BookLookupResult {
  return {
    ...primary,
    metadataSource: source,
    google,
    openLibrary,
  };
}

async function lookupBothProviders(isbn: string): Promise<{
  google: BookMetadata | null;
  openLibrary: BookMetadata | null;
}> {
  const [google, openLibrary] = await Promise.all([
    lookupGoogleBooks(isbn),
    lookupOpenLibrary(isbn),
  ]);
  return { google, openLibrary };
}

/** Global spacing between ISBN lookups (shared by hook + bulk refresh). */
let lastLookupAt = 0;

async function runLookupBody(isbn: string): Promise<BookLookupResult | null> {
  let { google, openLibrary } = await lookupBothProviders(isbn);

  if (!google && !openLibrary) {
    const alt = isbn.length === 13 ? isbn13To10(isbn) : isbn10To13(isbn);
    if (alt) {
      const altRes = await lookupBothProviders(alt);
      google = altRes.google;
      openLibrary = altRes.openLibrary;
      if (google) google = { ...google, isbn };
      if (openLibrary) openLibrary = { ...openLibrary, isbn };
    }
  }

  if (!google && !openLibrary) {
    addBreadcrumb('metadata', 'Lookup returned no results', { isbnLength: isbn.length });
    return null;
  }

  const source: MetadataSource = google ? 'google_books' : 'open_library';
  const primary = (google ?? openLibrary)!;

  return buildLookupResult(primary, source, google, openLibrary);
}

/**
 * Fetch metadata for an ISBN (cache + debounce). Use from hooks, bulk jobs, or scripts.
 * Does not touch React state.
 */
export async function fetchBookLookupByIsbn(
  isbn: string,
  options?: { bypassCache?: boolean },
): Promise<BookLookupResult | null> {
  if (!options?.bypassCache) {
    const cached = cache.get(isbn);
    if (cached) {
      addBreadcrumb('metadata', 'Lookup cache hit', { isbnLength: isbn.length });
      return cached;
    }
  }

  const now = Date.now();
  const elapsed = now - lastLookupAt;
  if (elapsed < 300) {
    await delay(300 - elapsed);
  }
  lastLookupAt = Date.now();

  try {
    addBreadcrumb('metadata', 'Lookup started', { isbnLength: isbn.length });
    const result = await runLookupBody(isbn);
    if (!result) return null;

    cache.set(isbn, result);
    addBreadcrumb('metadata', 'Lookup succeeded', {
      isbnLength: isbn.length,
      pageCount: result.pageCount,
      authorCount: result.authors.length,
      source: result.metadataSource,
    });
    return result;
  } catch (error) {
    captureException(error, { area: 'fetchBookLookupByIsbn', isbnLength: isbn.length });
    throw error;
  }
}

export const useBookLookup = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookupByIsbn = useCallback(async (
    isbn: string,
    options?: { bypassCache?: boolean },
  ): Promise<BookLookupResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchBookLookupByIsbn(isbn, options);
      if (!result) setError('No book found with this ISBN');
      return result;
    } catch {
      setError('Failed to fetch book metadata');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { lookupByIsbn, loading, error };
};
