import { useState, useRef } from 'react';
import { isbn13To10, isbn10To13 } from '../utils/isbnValidation.ts';
import { addBreadcrumb, captureException } from '../lib/errorMonitoring.ts';
import type { BookEntry } from '../types.ts';

export interface BookMetadata {
    title: string;
    authors: string[];
    pageCount: number;
    thumbnail: string;
    isbn: string;
}

const cache = new Map<string, BookMetadata>();

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
            // Try Google Books first
            let result = await lookupGoogleBooks(isbn);

            // Fall back to Open Library if Google returns nothing
            if (!result) {
                result = await lookupOpenLibrary(isbn);
            }

            // Try alternate ISBN format (13↔10) — some APIs have better coverage for one format
            if (!result) {
                const alt = isbn.length === 13 ? isbn13To10(isbn) : isbn10To13(isbn);
                if (alt) {
                    result = await lookupGoogleBooks(alt) ?? await lookupOpenLibrary(alt);
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
            });
            return result;
        } catch (error) {
            setError('Failed to fetch book metadata');
            captureException(error, { area: 'useBookLookup.lookupByIsbn', isbnLength: isbn.length });
            return null;
        } finally {
            setLoading(false);
        }
    };

    const refreshMetadata = async (book: BookEntry): Promise<Partial<BookEntry> | null> => {
        if (!book.isbn || book.isbn.startsWith('photo-')) return null;
        try {
            const result = await lookupByIsbn(book.isbn);
            if (!result) return null;
            return {
                title: result.title,
                author: result.authors.join(', '),
                pageCount: result.pageCount,
                coverImg: result.thumbnail,
                metadataSource: 'api' as const,
            };
        } catch {
            return null;
        }
    };

    return { lookupByIsbn, refreshMetadata, loading, error };
};
