import { fetchBookMetadata, type BookMetadata } from '../hooks/useBookLookup.ts';
import type { ShelfMetadataHit } from './types.ts';

const UNKNOWN_TITLE = 'unknown title';
const UNKNOWN_AUTHOR = 'unknown author';

export function bookMetadataToHit(meta: BookMetadata | null): ShelfMetadataHit | null {
  if (!meta) return null;
  return {
    title: meta.title || 'Unknown Title',
    author: meta.authors.filter(Boolean).join(', ') || 'Unknown Author',
    pageCount: meta.pageCount || 0,
    thumbnail: meta.thumbnail || '',
    isbn: meta.isbn || '',
    source: meta.source,
  };
}

/** ISBN lookup through the existing Google Books + Open Library pipeline. */
export async function lookupShelfByIsbn(isbn: string): Promise<ShelfMetadataHit | null> {
  try {
    return bookMetadataToHit(await fetchBookMetadata(isbn));
  } catch {
    return null;
  }
}

const pickIsbn = (values: unknown): string => {
  if (!Array.isArray(values)) return '';
  const digits = values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.replace(/[^0-9Xx]/g, ''));
  return digits.find((value) => value.length === 13) ?? digits.find((value) => value.length === 10) ?? '';
};

const lookupGoogleByText = async (
  title: string,
  author: string,
  fetchImpl: typeof fetch,
): Promise<ShelfMetadataHit | null> => {
  const query = author
    ? `intitle:${JSON.stringify(title)} inauthor:${JSON.stringify(author)}`
    : `intitle:${JSON.stringify(title)}`;
  const response = await fetchImpl(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1`,
  );
  if (!response.ok) return null;
  const data = await response.json() as {
    items?: Array<{
      volumeInfo?: {
        title?: string;
        authors?: string[];
        pageCount?: number;
        imageLinks?: { thumbnail?: string };
        industryIdentifiers?: Array<{ type?: string; identifier?: string }>;
      };
    }>;
  };
  const info = data.items?.[0]?.volumeInfo;
  if (!info?.title) return null;
  const identifiers = info.industryIdentifiers ?? [];
  const isbn13 = identifiers.find((id) => id.type === 'ISBN_13')?.identifier ?? '';
  const isbn10 = identifiers.find((id) => id.type === 'ISBN_10')?.identifier ?? '';
  return {
    title: info.title,
    author: info.authors?.filter(Boolean).join(', ') || 'Unknown Author',
    pageCount: info.pageCount || 0,
    thumbnail: info.imageLinks?.thumbnail || '',
    isbn: (isbn13 || isbn10 || '').replace(/[^0-9Xx]/g, ''),
    source: 'google_books',
  };
};

const lookupOpenLibraryByText = async (
  title: string,
  author: string,
  fetchImpl: typeof fetch,
): Promise<ShelfMetadataHit | null> => {
  const params = new URLSearchParams({ title, limit: '1' });
  if (author) params.set('author', author);
  const response = await fetchImpl(`https://openlibrary.org/search.json?${params.toString()}`);
  if (!response.ok) return null;
  const data = await response.json() as {
    docs?: Array<{
      title?: string;
      author_name?: string[];
      number_of_pages_median?: number;
      cover_i?: number;
      isbn?: string[];
    }>;
  };
  const doc = data.docs?.find((entry) => entry.title);
  if (!doc?.title) return null;
  return {
    title: doc.title,
    author: doc.author_name?.filter(Boolean).join(', ') || 'Unknown Author',
    pageCount: doc.number_of_pages_median || 0,
    thumbnail: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : '',
    isbn: pickIsbn(doc.isbn),
    source: 'open_library',
  };
};

/**
 * Title/author search for spines that have no barcode.
 * Google Books is preferred when it returns a hit; Open Library covers the miss.
 * Network failures return null so the OCR text can still be reviewed offline.
 */
export async function lookupShelfByTitleAuthor(
  title: string,
  author: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ShelfMetadataHit | null> {
  const cleanTitle = title.trim();
  if (cleanTitle.length < 2 || cleanTitle.toLowerCase() === UNKNOWN_TITLE) return null;
  const cleanAuthor = author.trim();
  const authorQuery = cleanAuthor && cleanAuthor.toLowerCase() !== UNKNOWN_AUTHOR ? cleanAuthor : '';

  const [google, openLibrary] = await Promise.all([
    lookupGoogleByText(cleanTitle, authorQuery, fetchImpl).catch(() => null),
    lookupOpenLibraryByText(cleanTitle, authorQuery, fetchImpl).catch(() => null),
  ]);
  return google ?? openLibrary;
}
