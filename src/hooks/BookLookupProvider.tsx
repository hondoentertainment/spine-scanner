import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  beginLookupRequest,
  isLookupRequestCurrent,
  lookupBookMetadataDetailed,
} from '../lib/bookLookupCore.ts';
import type { BookMetadata, MetadataLookupPayload } from '../types.ts';

export type { BookMetadata, MetadataLookupPayload } from '../types.ts';

interface BookLookupContextValue {
  lookupByIsbn: (isbn: string) => Promise<BookMetadata | null>;
  lookupByIsbnDetailed: (isbn: string) => Promise<MetadataLookupPayload | null>;
  loading: boolean;
  error: string | null;
}

const BookLookupContext = createContext<BookLookupContextValue | null>(null);

export function BookLookupProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lookupIdRef = useRef(0);

  const lookupByIsbnDetailed = useCallback(async (isbn: string): Promise<MetadataLookupPayload | null> => {
    const lookupId = beginLookupRequest();
    lookupIdRef.current = lookupId;
    setLoading(true);
    setError(null);
    try {
      const { payload, error: lookupError } = await lookupBookMetadataDetailed(
        isbn,
        lookupId,
        'useBookLookup.lookupByIsbnDetailed',
      );
      if (!isLookupRequestCurrent(lookupId)) return null;
      setError(lookupError);
      return payload;
    } finally {
      if (lookupIdRef.current === lookupId) {
        setLoading(false);
      }
    }
  }, []);

  const lookupByIsbn = useCallback(async (isbn: string): Promise<BookMetadata | null> => {
    const payload = await lookupByIsbnDetailed(isbn);
    return payload?.meta ?? null;
  }, [lookupByIsbnDetailed]);

  const value = useMemo(
    () => ({ lookupByIsbn, lookupByIsbnDetailed, loading, error }),
    [lookupByIsbn, lookupByIsbnDetailed, loading, error],
  );

  return (
    <BookLookupContext.Provider value={value}>
      {children}
    </BookLookupContext.Provider>
  );
}

export function useBookLookup(): BookLookupContextValue {
  const context = useContext(BookLookupContext);
  if (!context) {
    throw new Error('useBookLookup must be used within BookLookupProvider');
  }
  return context;
}
