import { isbn13To10, isbn10To13 } from '../utils/isbnValidation.ts';
import { addBreadcrumb, captureException } from '../lib/errorMonitoring.ts';
import { normalizeComparableText, pageCountsConflict } from '../lib/metadataCompare.ts';
import {
  clearPersistedLookupCache,
  getPersistedLookup,
  setPersistedLookup,
} from '../lib/metadataLookupCache.ts';
import type { BookMetadata, MetadataLookupPayload, MetadataSource } from '../types.ts';

const memoryCache = new Map<string, BookMetadata>();
const detailedMemoryCache = new Map<string, MetadataLookupPayload>();

export const normalizeIsbnKey = (isbn: string): string => isbn.replace(/[^0-9Xx]/g, '').toUpperCase();

let lastCallTime = 0;
let activeLookupId = 0;

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
    authors: entry.authors?.map((a) => a.name) || ['Unknown Author'],
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

function rememberLookup(cacheKey: string, payload: MetadataLookupPayload): void {
  detailedMemoryCache.set(cacheKey, payload);
  memoryCache.set(cacheKey, payload.meta);
  setPersistedLookup(cacheKey, payload);
}

export function clearBookLookupCaches(): void {
  memoryCache.clear();
  detailedMemoryCache.clear();
  clearPersistedLookupCache();
}

export function clearMemoryBookLookupCaches(): void {
  memoryCache.clear();
  detailedMemoryCache.clear();
}

export function beginLookupRequest(): number {
  return ++activeLookupId;
}

export function isLookupRequestCurrent(lookupId: number): boolean {
  return lookupId === activeLookupId;
}

export async function performBookLookup(
  isbn: string,
  lookupId: number,
): Promise<MetadataLookupPayload | null> {
  const cacheKey = normalizeIsbnKey(isbn);
  const cachedDetailed = detailedMemoryCache.get(cacheKey) ?? getPersistedLookup(cacheKey);
  if (cachedDetailed) {
    detailedMemoryCache.set(cacheKey, cachedDetailed);
    memoryCache.set(cacheKey, cachedDetailed.meta);
    addBreadcrumb('metadata', 'Lookup cache hit', { isbnLength: isbn.length });
    return cachedDetailed;
  }

  const now = Date.now();
  const elapsed = now - lastCallTime;
  if (elapsed < 300) {
    await delay(300 - elapsed);
  }
  lastCallTime = Date.now();

  if (!isLookupRequestCurrent(lookupId)) return null;

  addBreadcrumb('metadata', 'Lookup started', { isbnLength: isbn.length });
  const [googleResult, openLibraryResult] = await settleMetadataLookups(isbn);
  if (!isLookupRequestCurrent(lookupId)) return null;

  const directCandidates = [googleResult, openLibraryResult].filter(
    (candidate): candidate is BookMetadata => candidate != null,
  );

  let google = googleResult;
  let openLibrary = openLibraryResult;
  let allCandidates = [...directCandidates];

  if (directCandidates.length === 0) {
    const alt = isbn.length === 13 ? isbn13To10(isbn) : isbn10To13(isbn);
    if (alt) {
      const [altGoogleResult, altOpenLibraryResult] = await settleMetadataLookups(alt);
      if (!isLookupRequestCurrent(lookupId)) return null;
      google = altGoogleResult;
      openLibrary = altOpenLibraryResult;
      allCandidates = [altGoogleResult, altOpenLibraryResult].filter(
        (candidate): candidate is BookMetadata => candidate != null,
      );
    }
  }

  const primary = pickPrimaryMetadata(isbn, allCandidates);
  if (!primary) {
    addBreadcrumb('metadata', 'Lookup returned no results', { isbnLength: isbn.length });
    return null;
  }

  const meta = attachMetadataContext(primary, [google, openLibrary, ...allCandidates], isbn);
  const payload: MetadataLookupPayload = { meta, google, openLibrary };
  rememberLookup(cacheKey, payload);
  addBreadcrumb('metadata', 'Lookup succeeded', {
    isbnLength: isbn.length,
    pageCount: meta.pageCount,
    authorCount: meta.authors.length,
  });
  return payload;
}

export async function lookupBookMetadataDetailed(
  isbn: string,
  lookupId: number,
  area: string,
): Promise<{ payload: MetadataLookupPayload | null; error: string | null }> {
  try {
    const payload = await performBookLookup(isbn, lookupId);
    if (!isLookupRequestCurrent(lookupId)) {
      return { payload: null, error: null };
    }
    if (!payload) {
      return { payload: null, error: 'No book found with this ISBN' };
    }
    return { payload, error: null };
  } catch (lookupError) {
    if (isLookupRequestCurrent(lookupId)) {
      captureException(lookupError, { area, isbnLength: isbn.length });
      return { payload: null, error: 'Failed to fetch book metadata' };
    }
    return { payload: null, error: null };
  }
}
