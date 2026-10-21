import { useState, useRef } from 'react';
import { isbn10To13, isbn13To10 } from '../utils/isbnValidation.ts';
import { addBreadcrumb, captureException } from '../lib/errorMonitoring.ts';
import { useAnalyticsStore } from '../store/useAnalyticsStore.ts';
import {
  fetchBookMetadata as fetchSharedBookMetadata,
  type IsbnLookupResult,
} from '../../packages/shared/src/fetchBookMetadata.ts';
import type { BookEntry } from '../types.ts';

export type BookMetadata = IsbnLookupResult;

const cache = new Map<string, BookMetadata>();

/** Clear the in-memory lookup cache. Exposed for testing. */
export const clearLookupCache = () => cache.clear();

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Fetch fresh metadata for an ISBN, querying both sources for conflict detection. */
export const fetchBookMetadata = async (isbn: string): Promise<BookMetadata | null> => {
  const result = await fetchSharedBookMetadata(isbn);
  if (result?.metadataConflicts && result.metadataConflicts.length > 0) {
    useAnalyticsStore.getState().track('metadata_conflict', {
      isbnLength: isbn.length,
      conflictCount: result.metadataConflicts.length,
    });
  }
  return result;
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
                source: result.source,
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
            const edited = book.userEditedFields ?? {};
            return {
                ...(!edited.title ? { title: result.title } : {}),
                ...(!edited.author ? { author: result.authors.join(', ') } : {}),
                ...(!edited.pageCount ? { pageCount: result.pageCount } : {}),
                ...(!edited.coverImg ? { coverImg: result.thumbnail } : {}),
                metadataSource: result.source,
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
