import { useState, useRef } from 'react';
import { isbn13To10, isbn10To13 } from '../utils/isbnValidation.ts';
import { addBreadcrumb, captureException } from '../lib/errorMonitoring.ts';
import { useAnalyticsStore } from '../store/useAnalyticsStore.ts';
import type { BookEntry, MetadataSource, MetadataConflict } from '../types.ts';

export interface BookMetadata {
    title: string;
    authors: string[];
    pageCount: number;
    thumbnail: string;
    isbn: string;
    metadataSource: MetadataSource;
    metadataConflicts?: MetadataConflict[];
}

const cache = new Map<string, BookMetadata>();

/** Clear the in-memory lookup cache. Exposed for testing. */
export const clearLookupCache = () => cache.clear();

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

interface RawBookMetadata {
    title: string;
    authors: string[];
    pageCount: number;
    thumbnail: string;
    isbn: string;
}

const lookupGoogleBooks = async (isbn: string): Promise<RawBookMetadata | null> => {
    const response = await fetchWithRetry(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`
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
    };
};

const lookupOpenLibrary = async (isbn: string): Promise<RawBookMetadata | null> => {
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

    if (google.pageCount > 0 && openLib.pageCount > 0 &&
        Math.abs(google.pageCount - openLib.pageCount) > CONFLICT_PAGE_THRESHOLD) {
        conflicts.push({ field: 'pageCount', googleBooks: google.pageCount, openLibrary: openLib.pageCount });
    }

    return conflicts;
};

/** Fetch fresh metadata for an ISBN, querying both sources for conflict detection. */
export const fetchBookMetadata = async (isbn: string): Promise<BookMetadata | null> => {
    const [googleSettled, openLibSettled] = await Promise.allSettled([
        lookupGoogleBooks(isbn),
        lookupOpenLibrary(isbn),
    ]);

    const google = googleSettled.status === 'fulfilled' ? googleSettled.value : null;
    const openLib = openLibSettled.status === 'fulfilled' ? openLibSettled.value : null;

    // Both APIs rejected (network-level failure) — propagate so callers can show the right error
    if (googleSettled.status === 'rejected' && openLibSettled.status === 'rejected') {
        throw new Error('Failed to fetch book metadata');
    }

    if (!google && !openLib) return null;

    const primary = google ?? openLib!;
    const source: MetadataSource = google ? 'google_books' : 'open_library';
    const conflicts = google && openLib ? detectConflicts(google, openLib) : undefined;

    if (conflicts && conflicts.length > 0) {
        useAnalyticsStore.getState().track('metadata_conflict', {
            isbnLength: isbn.length,
            conflictCount: conflicts.length,
        });
    }

    return { ...primary, metadataSource: source, metadataConflicts: conflicts?.length ? conflicts : undefined };
};

export const useBookLookup = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const lastCallTime = useRef(0);

    const lookupByIsbn = async (isbn: string): Promise<BookMetadata | null> => {
        const cached = cache.get(isbn);
        if (cached) {
            addBreadcrumb('metadata', 'Lookup cache hit', { isbnLength: isbn.length });
            return cached;
        }

        // Debounce: enforce minimum 300ms between API calls
        const now = Date.now();
        const elapsed = now - lastCallTime.current;
        if (elapsed < 300) {
            await delay(300 - elapsed);
        }
        lastCallTime.current = Date.now();

        setLoading(true);
        setError(null);
        try {
            addBreadcrumb('metadata', 'Lookup started', { isbnLength: isbn.length });

            let result = await fetchBookMetadata(isbn);

            // Try alternate ISBN format (13↔10) — some APIs have better coverage for one format
            if (!result) {
                const alt = isbn.length === 13 ? isbn13To10(isbn) : isbn10To13(isbn);
                if (alt) {
                    result = await fetchBookMetadata(alt);
                    if (result) {
                        result = { ...result, isbn };
                    }
                }
            }

            if (!result) {
                setError('No book found with this ISBN');
                addBreadcrumb('metadata', 'Lookup returned no results', { isbnLength: isbn.length });
                return null;
            }

            cache.set(isbn, result);
            addBreadcrumb('metadata', 'Lookup succeeded', {
                isbnLength: isbn.length,
                pageCount: result.pageCount,
                authorCount: result.authors.length,
                source: result.metadataSource,
            });
            return result;
        } catch (err) {
            setError('Failed to fetch book metadata');
            captureException(err, { area: 'useBookLookup.lookupByIsbn', isbnLength: isbn.length });
            return null;
        } finally {
            setLoading(false);
        }
    };

    const refreshMetadata = async (book: BookEntry): Promise<Partial<BookEntry> | null> => {
        if (!book.isbn || book.isbn.startsWith('photo-')) return null;
        setLoading(true);
        setError(null);
        try {
            const result = await fetchBookMetadata(book.isbn);
            if (!result) {
                setError('No book found with this ISBN');
                return null;
            }
            return {
                title: result.title,
                author: result.authors.join(', '),
                pageCount: result.pageCount,
                coverImg: result.thumbnail,
                metadataSource: result.metadataSource,
                metadataConflicts: result.metadataConflicts,
            };
        } catch (err) {
            setError('Failed to refresh metadata');
            captureException(err, { area: 'useBookLookup.refreshMetadata', isbnLength: book.isbn.length });
            return null;
        } finally {
            setLoading(false);
        }
    };

    return { lookupByIsbn, refreshMetadata, loading, error };
};
