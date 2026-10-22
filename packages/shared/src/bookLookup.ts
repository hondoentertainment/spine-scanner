import type { BookMetadata, MetadataLookupPayload, MetadataSource } from './types';
import { isbn10To13, isbn13To10 } from './isbn';
import { normalizeComparableText, pageCountsConflict } from './metadataCompare';

export const normalizeIsbnKey = (isbn: string): string => isbn.replace(/[^0-9Xx]/g, '').toUpperCase();

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithRetry = async (url: string, retries = 2): Promise<Response> => {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
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

const getConflictReasons = (primary: BookMetadata, other: BookMetadata): string[] => {
  const reasons: string[] = [];
  if (normalizeComparableText(primary.title) !== normalizeComparableText(other.title)) reasons.push('title');
  if (normalizeComparableText(primary.authors.join(', ')) !== normalizeComparableText(other.authors.join(', '))) {
    reasons.push('author');
  }
  if (pageCountsConflict(primary.pageCount, other.pageCount)) reasons.push('page count');
  if (!primary.thumbnail && other.thumbnail) reasons.push('cover');
  return reasons;
};

const attachMetadataContext = (
  primary: BookMetadata,
  candidates: Array<BookMetadata | null>,
  requestedIsbn: string,
): BookMetadata => {
  const conflicts = candidates
    .filter((candidate): candidate is BookMetadata => candidate != null && candidate.source !== primary.source)
    .map((candidate) => ({ candidate, reasons: getConflictReasons(primary, candidate) }))
    .filter(({ reasons }) => reasons.length > 0)
    .map(({ candidate, reasons }) => ({
      source: candidate.source as MetadataSource,
      title: candidate.title,
      authors: candidate.authors,
      pageCount: candidate.pageCount,
      thumbnail: candidate.thumbnail,
      isbn: candidate.isbn,
      reasons,
    }));

  const bestCover = primary.thumbnail || candidates.find((candidate) => candidate?.thumbnail)?.thumbnail || '';
  return {
    ...primary,
    isbn: requestedIsbn,
    matchedIsbn: primary.isbn,
    thumbnail: bestCover,
    editionFallback: normalizeIsbnKey(primary.isbn) !== normalizeIsbnKey(requestedIsbn),
    ...(conflicts.length > 0 ? { conflicts } : {}),
  };
};

const lookupGoogleBooks = async (isbn: string): Promise<BookMetadata | null> => {
  const response = await fetchWithRetry(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`,
  );
  if (!response.ok) return null;

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return null;
  }

  if (!data || typeof data !== 'object') return null;
  const payload = data as { totalItems?: number; items?: Array<{ volumeInfo?: Record<string, unknown> }> };
  if (!payload.totalItems || payload.totalItems === 0) return null;
  if (!Array.isArray(payload.items) || payload.items.length === 0) return null;

  const volumeInfo = payload.items[0]?.volumeInfo;
  if (!volumeInfo) return null;

  const imageLinks = volumeInfo.imageLinks as { thumbnail?: string } | undefined;
  const authors = volumeInfo.authors as string[] | undefined;

  return {
    title: (volumeInfo.title as string | undefined) || 'Unknown Title',
    authors: authors?.length ? authors : ['Unknown Author'],
    pageCount: (volumeInfo.pageCount as number | undefined) || 0,
    thumbnail: imageLinks?.thumbnail || '',
    isbn,
    source: 'google_books',
  };
};

const lookupOpenLibrary = async (isbn: string): Promise<BookMetadata | null> => {
  const response = await fetchWithRetry(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
  );
  if (!response.ok) return null;

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return null;
  }

  if (!data || typeof data !== 'object') return null;
  const entry = (data as Record<string, {
    title?: string;
    authors?: Array<{ name: string }>;
    number_of_pages?: number;
    cover?: { medium?: string; small?: string };
  }>)[`ISBN:${isbn}`];
  if (!entry) return null;

  return {
    title: entry.title || 'Unknown Title',
    authors: entry.authors?.map((author) => author.name) || ['Unknown Author'],
    pageCount: entry.number_of_pages || 0,
    thumbnail: entry.cover?.medium || entry.cover?.small || '',
    isbn,
    source: 'open_library',
  };
};

const settleMetadataLookups = async (isbn: string): Promise<Array<BookMetadata | null>> => {
  const results = await Promise.allSettled([
    lookupGoogleBooks(isbn),
    lookupOpenLibrary(isbn),
  ]);

  if (results.every((result) => result.status === 'rejected')) {
    const firstRejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    throw firstRejected?.reason ?? new Error('Metadata lookup failed');
  }

  return results.map((result) => (result.status === 'fulfilled' ? result.value : null));
};

const pickPrimaryMetadata = (
  requestedIsbn: string,
  candidates: BookMetadata[],
): BookMetadata | null => {
  if (candidates.length === 0) return null;
  const key = normalizeIsbnKey(requestedIsbn);
  const exact = candidates.find((candidate) => normalizeIsbnKey(candidate.isbn) === key);
  if (exact) return exact;
  return candidates.find((candidate) => candidate.source === 'google_books') ?? candidates[0] ?? null;
};

/**
 * Google Books + Open Library lookup for one ISBN, including the ISBN-10/13
 * alternate and field conflicts. No localStorage cache and no analytics.
 * The web app wraps this with its cache, rate limit, and error reporting.
 */
export async function lookupBookByIsbn(isbn: string): Promise<MetadataLookupPayload | null> {
  const [googleResult, openLibraryResult] = await settleMetadataLookups(isbn);

  let google = googleResult;
  let openLibrary = openLibraryResult;
  let allCandidates = [googleResult, openLibraryResult].filter(
    (candidate): candidate is BookMetadata => candidate != null,
  );

  if (allCandidates.length === 0) {
    const alt = isbn.length === 13 ? isbn13To10(isbn) : isbn10To13(isbn);
    if (alt) {
      const [altGoogle, altOpenLibrary] = await settleMetadataLookups(alt);
      google = altGoogle;
      openLibrary = altOpenLibrary;
      allCandidates = [altGoogle, altOpenLibrary].filter(
        (candidate): candidate is BookMetadata => candidate != null,
      );
    }
  }

  const primary = pickPrimaryMetadata(isbn, allCandidates);
  if (!primary) return null;

  const meta = attachMetadataContext(primary, [google, openLibrary, ...allCandidates], isbn);
  return { meta, google, openLibrary };
}
