import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ManualIsbnFormHandle } from '../components/ManualIsbnForm.tsx';
import { useToast } from '../components/Toast.tsx';
import { pushBooks } from '../lib/syncBooks.ts';
import { importShelfBooks } from '../shelf/reviewImport.ts';
import type { ShelfReviewItem } from '../shelf/types.ts';
import { useAnalyticsStore } from '../store/useAnalyticsStore.ts';
import { useAuthStore } from '../store/useAuthStore.ts';
import { useBookStore } from '../store/useBookStore.ts';
import { useProfileStore } from '../store/useProfileStore.ts';
import type { BookEntry } from '../types.ts';
import { generateAmazonLink } from '../utils/amazonLink.ts';
import { batchSummaryMessage } from '../utils/batchSession.ts';
import { createPhotoOnlyBook } from '../utils/bookState.ts';
import { isValidIsbn, normalizeToIsbn13 } from '../utils/isbnValidation.ts';
import { isbnExistsInLibrary } from '../utils/libraryUtils.ts';
import { useBookLookup } from './useBookLookup.ts';

export type ScanRequestOptions = {
  allowReview?: boolean;
  source?: 'scan' | 'manual' | 'ocr' | 'barcode' | 'suggestion';
};

/** Scan, photo, and shelf-import handlers. Stays mounted so a batch summary can fire after leaving /scan. */
export function useScanCapture(online: boolean) {
  const navigate = useNavigate();
  const location = useLocation();
  const { lookupByIsbn, loading, error } = useBookLookup();
  const { addBook, books } = useBookStore();
  const { user } = useAuthStore();
  const { preferences } = useProfileStore();
  const { toast, confirm } = useToast();
  const { track } = useAnalyticsStore();
  const [recentAdd, setRecentAdd] = useState<{ title: string; isbn: string } | null>(null);
  const [isbnEntryActive, setIsbnEntryActive] = useState(false);
  const isbnFormRef = useRef<ManualIsbnFormHandle>(null);
  const batchMode = preferences.batchModeDefault;
  const batchBooksAddedRef = useRef(0);

  const handlePhotoCapture = useCallback((imageDataUrl: string) => {
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2);
    const newBook = createPhotoOnlyBook({ id, coverImg: imageDataUrl });
    addBook(newBook);
    track('book_added', { method: 'photo' });
    setRecentAdd({ title: newBook.title, isbn: newBook.isbn });
    toast(`Added ${newBook.title}`, 'success', 6000, undefined, {
      label: 'View',
      onClick: () => navigate(`/library?isbn=${encodeURIComponent(newBook.isbn)}`),
    });
    if (user && online) {
      void pushBooks(user.id, [...books, newBook]).catch(() => toast('Cloud sync failed. Changes saved locally.', 'warning'));
    }
  }, [addBook, books, user, online, toast, track, navigate]);

  const handleShelfImport = useCallback((items: ShelfReviewItem[]) => {
    const current = useBookStore.getState().books;
    const { added, skippedDuplicates } = importShelfBooks(items, current, addBook);
    if (added.length === 0) {
      toast(skippedDuplicates > 0
        ? 'Those books are already in your library.'
        : 'Select at least one book to add.', 'info');
      return false;
    }
    added.forEach((book) => track('book_added', { method: 'shelf_scan', isbn: book.isbn }));
    const skippedNote = skippedDuplicates > 0 ? ` Skipped ${skippedDuplicates} already in your library.` : '';
    const label = added.length === 1 ? added[0].title : `${added.length} books`;
    setRecentAdd({ title: label, isbn: added[0].isbn });
    toast(`Added ${label}${skippedNote}`, 'success', 6000, undefined, {
      label: 'View',
      onClick: () => navigate(added.length === 1
        ? `/library?isbn=${encodeURIComponent(added[0].isbn)}`
        : '/library'),
    });
    if (user && online) {
      const next = useBookStore.getState().books;
      void pushBooks(user.id, next).catch(() => toast('Cloud sync failed. Changes saved locally.', 'warning'));
    }
    return true;
  }, [addBook, navigate, online, toast, track, user]);

  useEffect(() => {
    if (!batchMode) batchBooksAddedRef.current = 0;
  }, [batchMode]);

  // B5: when a batch-scan session ends (user leaves the scanner), surface a
  // session summary so multi-book sessions get a clear closing confirmation.
  const prevPathRef = useRef(location.pathname);
  useEffect(() => {
    const prevPath = prevPathRef.current;
    prevPathRef.current = location.pathname;
    if (prevPath === '/scan' && location.pathname !== '/scan' && batchBooksAddedRef.current > 0) {
      toast(batchSummaryMessage(batchBooksAddedRef.current), 'success', 5000);
      batchBooksAddedRef.current = 0;
    }
  }, [location.pathname, toast]);

  const addBookAndOpen = useCallback((newBook: BookEntry, trackMethod: string) => {
    addBook(newBook);
    track('book_added', { method: trackMethod, isbn: newBook.isbn });
    if (batchMode) batchBooksAddedRef.current += 1;
    setRecentAdd({ title: newBook.title, isbn: newBook.isbn });
    toast(`Added ${newBook.title}`, 'success', 6000, undefined, {
      label: 'View',
      onClick: () => navigate(`/library?isbn=${encodeURIComponent(newBook.isbn)}`),
    });

    if (user && online) {
      void pushBooks(user.id, [...books, newBook]).catch(() => toast('Cloud sync failed. Changes saved locally.', 'warning'));
    }
  }, [addBook, batchMode, books, navigate, online, toast, track, user]);

  const handleScan = async (isbn: string, options: ScanRequestOptions = {}) => {
    const normalizedInput = isbn.replace(/[^0-9Xx]/g, '').replace(/x$/i, 'X') || isbn;
    const isChecksumValid = isValidIsbn(normalizedInput);
    const canReviewInvalid = options.allowReview === true && !isChecksumValid;

    if (preferences.warnOnDuplicateIsbn !== false && isbnExistsInLibrary(normalizedInput, books)) {
      if (batchMode && options.source !== 'manual') {
        toast('Already in your library. Keep scanning.', 'info');
        return;
      }
      const openInLibrary = await confirm({
        title: 'Book already in library',
        message: 'You already added this book. Open it in your library instead?',
        confirmLabel: 'Open in library',
        cancelLabel: 'Dismiss',
      });
      if (openInLibrary) {
        navigate(`/library?isbn=${encodeURIComponent(normalizedInput)}`);
      }
      return;
    }

    if (!isChecksumValid) {
      if (!canReviewInvalid) {
        toast('That ISBN looks incomplete. Try again or add it for review.', 'error');
        return;
      }

      const reviewBook: BookEntry = {
        id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        isbn: normalizedInput,
        title: 'Review ISBN Entry',
        author: 'Manual Entry',
        pageCount: 0,
        amazonLink: generateAmazonLink(normalizedInput),
        coverImg: '',
        status: 'to-read',
        notes: 'Added from manual ISBN entry. Verify the ISBN and complete the details.',
        dateAdded: new Date().toISOString(),
        shelfIds: [],
        needsReview: true,
        reviewReason: 'Manual ISBN needs verification.',
        metadataSource: 'manual',
      };

      addBookAndOpen(reviewBook, 'manual_review');
      return;
    }

    try {
      const metadata = await lookupByIsbn(normalizedInput);
      if (metadata) {
        const storedIsbn = normalizeToIsbn13(metadata.isbn);
        const newBook: BookEntry = {
          id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2),
          isbn: storedIsbn,
          title: metadata.title,
          author: metadata.authors.join(', '),
          pageCount: metadata.pageCount,
          amazonLink: generateAmazonLink(storedIsbn),
          coverImg: metadata.thumbnail,
          status: 'to-read',
          notes: '',
          dateAdded: new Date().toISOString(),
          shelfIds: [],
          metadataSource: metadata.source,
        };
        addBookAndOpen(newBook, options.source === 'manual' ? 'manual' : 'scan');
      } else {
        const addAnyway = await confirm({
          title: 'No metadata found',
          message: `We couldn't find details for ISBN ${normalizedInput}. Add it anyway so you can fill them in manually?`,
          confirmLabel: 'Add anyway',
          cancelLabel: 'Cancel',
        });
        if (addAnyway) {
          const storedIsbn = normalizeToIsbn13(normalizedInput);
          const newBook: BookEntry = {
            id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2),
            isbn: storedIsbn,
            title: 'Unknown Title',
            author: 'Unknown Author',
            pageCount: 0,
            amazonLink: generateAmazonLink(storedIsbn),
            coverImg: '',
            status: 'to-read',
            notes: '',
            dateAdded: new Date().toISOString(),
            shelfIds: [],
            needsReview: true,
            reviewReason: 'Metadata not found. Add details manually.',
            metadataSource: 'manual',
          };
          addBookAndOpen(newBook, options.source === 'manual' ? 'manual_no_metadata' : 'scan_no_metadata');
        } else {
          toast('No metadata found for that ISBN.', 'error');
        }
      }
    } catch (err) {
      console.error('[App] Error during scan handler:', err);
      toast('Book lookup failed. Try again or add the ISBN manually.', 'error');
    }
  };

  return {
    isbnFormRef,
    loading,
    error,
    isbnEntryActive,
    setIsbnEntryActive,
    recentAdd,
    setRecentAdd,
    handleScan,
    handlePhotoCapture,
    handleShelfImport,
  };
}
