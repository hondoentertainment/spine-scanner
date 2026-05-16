import { useState, useRef } from 'react';
import { isbn13To10, isbn10To13 } from '../utils/isbnValidation.ts';
import { addBreadcrumb, captureException } from '../lib/errorMonitoring.ts';

import type { MetadataSource } from '../types.ts';

export interface BookMetadata {
    title: string;
    authors: string[];
    pageCount: number;
    thumbnail: string;
    isbn: string;
    /** Provider that returned this metadata. Phase 26 attribution. */
    source: MetadataSource;
    /** Other providers or ISBN editions that returned materially different metadata. */
    conflicts?: MetadataConflict[];
    /** Alternate ISBN edition queried while resolving this result. */
    matchedIsbn?: string;
    /** True when the selected result came from an ISBN-10/13 alternate query. */
    editionFallback?: boolean;
}

export interface MetadataConflict {
    source: MetadataSource;
    title: string;
    authors: string[];
    pageCount: number;
    thumbnail: string;
    isbn: string;
    reasons: string[];
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

const normalizeComparable = (value: string) =>
    value.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();

const getConflictReasons = (primary: BookMetadata, other: BookMetadata): string[] => {
    const reasons: string[] = [];
    if (normalizeComparable(primary.title) !== normalizeComparable(other.title)) reasons.push('title');
    if (normalizeComparable(primary.authors.join(', ')) !== normalizeComparable(other.authors.join(', '))) reasons.push('author');
    if (primary.pageCount > 0 && other.pageCount > 0 && Math.abs(primary.pageCount - other.pageCount) > 10) reasons.push('page count');
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
            source: candidate.source,
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
        editionFallback: primary.isbn !== requestedIsbn,
        ...(conflicts.length > 0 ? { conflicts } : {}),
    };
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
            const googleResult = await lookupGoogleBooks(isbn);
            const openLibraryResult = await lookupOpenLibrary(isbn);
            let result = googleResult ?? openLibraryResult;
            const candidates: Array<BookMetadata | null> = [googleResult, openLibraryResult];

            // Try alternate ISBN format (13↔10) — some APIs have better coverage for one format
            if (!result) {
                const alt = isbn.length === 13 ? isbn13To10(isbn) : isbn10To13(isbn);
                if (alt) {
                    const altGoogleResult = await lookupGoogleBooks(alt);
                    const altOpenLibraryResult = await lookupOpenLibrary(alt);
                    candidates.push(altGoogleResult, altOpenLibraryResult);
                    result = altGoogleResult ?? altOpenLibraryResult;
                }
            }

            if (!result) {
                setError('No book found with this ISBN');
                addBreadcrumb('metadata', 'Lookup returned no results', { isbnLength: isbn.length });
                return null;
            }

            result = attachMetadataContext(result, candidates, isbn);
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

    return { lookupByIsbn, loading, error };
};
