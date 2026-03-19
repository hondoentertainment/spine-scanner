import { useState, useRef } from 'react';
import { isbn13To10, isbn10To13 } from '../utils/isbnValidation.ts';
import type { MetadataSource } from '../types.ts';

export interface BookMetadata {
    title: string;
    authors: string[];
    pageCount: number;
    thumbnail: string;
    isbn: string;
    /** Which API provided this metadata. */
    source: MetadataSource;
}

const cache = new Map<string, BookMetadata>();

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ─── Sliding-window rate limiter ─────────────────────────────────────────────
// Max 10 requests per 10-second window across both APIs combined.
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX = 10;
const requestTimestamps: number[] = [];

/** Returns ms to wait before the next request is allowed, or 0 if not limited. */
function getRateLimitDelay(): number {
    const now = Date.now();
    // Evict timestamps older than the window
    while (requestTimestamps.length > 0 && now - requestTimestamps[0] > RATE_LIMIT_WINDOW_MS) {
        requestTimestamps.shift();
    }
    if (requestTimestamps.length >= RATE_LIMIT_MAX) {
        // Wait until the oldest request falls out of the window
        return RATE_LIMIT_WINDOW_MS - (now - requestTimestamps[0]) + 50;
    }
    return 0;
}

function recordRequest() {
    requestTimestamps.push(Date.now());
}

const fetchWithRetry = async (url: string, retries = 2): Promise<Response> => {
    // Enforce rate limit before issuing the request
    const waitMs = getRateLimitDelay();
    if (waitMs > 0) {
        await delay(waitMs);
    }
    recordRequest();

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url);
            if (response.ok) return response;
            // Honour Retry-After header on 429
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After');
                const backoff = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000;
                if (attempt < retries) { await delay(backoff); continue; }
                return response;
            }
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
        source: 'google_books',
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
        source: 'open_library',
    };
};

/**
 * Attempt to recover a missing cover image from the Open Library covers CDN.
 * Returns the CDN URL if the image loads, otherwise empty string.
 */
const recoverCoverImage = (isbn: string): string => {
    return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
};

export const useBookLookup = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const lastCallTime = useRef(0);

    const lookupByIsbn = async (isbn: string): Promise<BookMetadata | null> => {
        const cached = cache.get(isbn);
        if (cached) return cached;

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
                return null;
            }

            // If both APIs returned no cover image, try the Open Library covers CDN
            if (!result.thumbnail) {
                result = { ...result, thumbnail: recoverCoverImage(isbn) };
            }

            cache.set(isbn, result);
            return result;
        } catch (err) {
            const msg = err instanceof Error ? err.message : '';
            setError(msg.includes('rate') ? 'Too many lookups — please wait a moment and try again.' : 'Failed to fetch book metadata');
            return null;
        } finally {
            setLoading(false);
        }
    };

    return { lookupByIsbn, loading, error };
};
