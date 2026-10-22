import { addBreadcrumb, captureException } from './errorMonitoring.ts';
import {
  clearPersistedLookupCache,
  getPersistedLookup,
  setPersistedLookup,
} from './metadataLookupCache.ts';
import { lookupBookByIsbn, normalizeIsbnKey } from '../../packages/shared/src/bookLookup.ts';
import type { BookMetadata, MetadataLookupPayload } from '../types.ts';

export { normalizeIsbnKey };

const memoryCache = new Map<string, BookMetadata>();
const detailedMemoryCache = new Map<string, MetadataLookupPayload>();

let lastCallTime = 0;
let activeLookupId = 0;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const payload = await lookupBookByIsbn(isbn);
  if (!isLookupRequestCurrent(lookupId)) return null;

  if (!payload) {
    addBreadcrumb('metadata', 'Lookup returned no results', { isbnLength: isbn.length });
    return null;
  }

  rememberLookup(cacheKey, payload);
  addBreadcrumb('metadata', 'Lookup succeeded', {
    isbnLength: isbn.length,
    pageCount: payload.meta.pageCount,
    authorCount: payload.meta.authors.length,
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
