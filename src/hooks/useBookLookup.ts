import { useState, useRef, useCallback } from 'react';
import { validateISBN } from '../utils/isbnValidation.ts';

export interface BookMetadata {
    title: string;
    authors: string[];
    pageCount: number;
    thumbnail: string;
    isbn: string;
}

// In-memory cache for API responses
const lookupCache = new Map<string, BookMetadata | null>();

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Fetch with retry and exponential backoff.
 */
const fetchWithRetry = async (url: string, retries = 2): Promise<Response> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url);
            if (response.ok) return response;
            if (response.status >= 400 && response.status < 500) return response;
        } catch (err) {
            if (attempt === retries) throw err;
        }
        await delay(1000 * Math.pow(2, attempt));
    }
    throw new Error('Request failed after retries');
};

const lookupGoogle = async (isbn: string): Promise<BookMetadata | null> => {
    const response = await fetchWithRetry(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`
    );
    const data = await response.json();

    if (data.totalItems === 0 || !data.items?.length) return null;

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
        thumbnail: entry.cover?.medium || '',
        isbn,
    };
};

export const useBookLookup = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const pendingRef = useRef<string | null>(null);

    const lookupByIsbn = useCallback(async (isbn: string): Promise<BookMetadata | null> => {
        const validation = validateISBN(isbn);
        if (!validation.valid) {
            setError(validation.error || 'Invalid ISBN');
            return null;
        }

        // Debounce: skip if same ISBN lookup is already in-flight
        if (pendingRef.current === isbn) return null;

        // Check cache
        if (lookupCache.has(isbn)) {
            const cached = lookupCache.get(isbn)!;
            if (!cached) {
                setError('No book found with this ISBN');
            }
            return cached;
        }

        pendingRef.current = isbn;
        setLoading(true);
        setError(null);

        try {
            // Try Google Books first
            let result = await lookupGoogle(isbn);

            // Fallback to Open Library
            if (!result) {
                result = await lookupOpenLibrary(isbn);
            }

            lookupCache.set(isbn, result);

            if (!result) {
                setError('No book found with this ISBN');
            }

            return result;
        } catch {
            setError('Failed to fetch book metadata. Please try again.');
            return null;
        } finally {
            pendingRef.current = null;
            setLoading(false);
        }
    }, []);

    return { lookupByIsbn, loading, error };
};
