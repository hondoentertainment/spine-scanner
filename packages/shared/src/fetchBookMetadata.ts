import type { MetadataConflict, MetadataSource } from './types';
import { isbn10To13, isbn13To10 } from './isbn';

export interface IsbnLookupResult {
  title: string;
  authors: string[];
  pageCount: number;
  thumbnail: string;
  isbn: string;
  source: MetadataSource;
  metadataConflicts?: MetadataConflict[];
}

interface RawBookMetadata {
  title: string;
  authors: string[];
  pageCount: number;
  thumbnail: string;
  isbn: string;
  source: MetadataSource;
}

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

const lookupGoogleBooks = async (isbn: string): Promise<RawBookMetadata | null> => {
  const response = await fetchWithRetry(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`,
  );
  const data = await response.json();
  if (!data.items || data.totalItems === 0) return null;

  const volumeInfo = data.items[0].volumeInfo;
  return {
    title: volumeInfo.title || 'Unknown Title',
    authors: volumeInfo.authors || ['Unknown Author'],
    pageCount: volumeInfo.pageCount || 0,
    thumbnail: volumeInfo.imageLinks?.thumbnail || '',
    isbn,
    source: 'google_books',
  };
};

const lookupOpenLibrary = async (isbn: string): Promise<RawBookMetadata | null> => {
  const response = await fetchWithRetry(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
  );
  const data = await response.json();
  const entry = data[`ISBN:${isbn}`];
  if (!entry) return null;

  return {
    title: entry.title || 'Unknown Title',
    authors: entry.authors?.map((author: { name: string }) => author.name) || ['Unknown Author'],
    pageCount: entry.number_of_pages || 0,
    thumbnail: entry.cover?.medium || entry.cover?.small || '',
    isbn,
    source: 'open_library',
  };
};

const CONFLICT_PAGE_THRESHOLD = 5;

const detectConflicts = (google: RawBookMetadata, openLib: RawBookMetadata): MetadataConflict[] => {
  const conflicts: MetadataConflict[] = [];

  const gTitle = google.title?.toLowerCase().trim();
  const olTitle = openLib.title?.toLowerCase().trim();
  if (gTitle && olTitle && gTitle !== olTitle) {
    conflicts.push({ field: 'title', googleBooks: google.title, openLibrary: openLib.title });
  }

  const gAuthor = (google.authors[0] ?? '').toLowerCase().trim();
  const olAuthor = (openLib.authors[0] ?? '').toLowerCase().trim();
  if (gAuthor && olAuthor && gAuthor !== olAuthor) {
    conflicts.push({ field: 'author', googleBooks: google.authors[0], openLibrary: openLib.authors[0] });
  }

  if (google.pageCount > 0 && openLib.pageCount > 0
    && Math.abs(google.pageCount - openLib.pageCount) > CONFLICT_PAGE_THRESHOLD) {
    conflicts.push({ field: 'pageCount', googleBooks: google.pageCount, openLibrary: openLib.pageCount });
  }

  return conflicts;
};

/** Google Books + Open Library for one ISBN. Same rules as the web scanner. */
export const fetchBookMetadata = async (isbn: string): Promise<IsbnLookupResult | null> => {
  const [googleSettled, openLibSettled] = await Promise.allSettled([
    lookupGoogleBooks(isbn),
    lookupOpenLibrary(isbn),
  ]);

  const google = googleSettled.status === 'fulfilled' ? googleSettled.value : null;
  const openLib = openLibSettled.status === 'fulfilled' ? openLibSettled.value : null;

  if (googleSettled.status === 'rejected' && openLibSettled.status === 'rejected') {
    throw new Error('Failed to fetch book metadata');
  }

  if (!google && !openLib) return null;

  const primary = google ?? openLib!;
  const source: MetadataSource = google ? 'google_books' : 'open_library';
  const conflicts = google && openLib ? detectConflicts(google, openLib) : undefined;

  return { ...primary, source, metadataConflicts: conflicts?.length ? conflicts : undefined };
};

/** Try the other ISBN-10/13 form when the scanned one has no hit. Keeps the scanned ISBN. */
export async function lookupIsbnWithFallback(isbn: string): Promise<IsbnLookupResult | null> {
  let result = await fetchBookMetadata(isbn);
  if (!result) {
    const alt = isbn.length === 13 ? isbn13To10(isbn) : isbn10To13(isbn);
    if (alt) {
      result = await fetchBookMetadata(alt);
      if (result) result = { ...result, isbn };
    }
  }
  return result;
}
