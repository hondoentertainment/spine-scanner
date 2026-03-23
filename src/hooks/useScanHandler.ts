import { useCallback, useEffect, useRef } from 'react';
import { useBookLookup } from './useBookLookup.ts';
import { useBookStore } from '../store/useBookStore.ts';
import { useAuthStore } from '../store/useAuthStore.ts';
import { useProfileStore } from '../store/useProfileStore.ts';
import { useOnlineStatus } from './useOnlineStatus.ts';
import { useToast } from '../components/Toast.tsx';
import { useAnalyticsStore } from '../store/useAnalyticsStore.ts';
import { pushBooks } from '../lib/syncBooks.ts';
import { generateAmazonLink } from '../utils/amazonLink.ts';
import { isValidIsbn, normalizeToIsbn13 } from '../utils/isbnValidation.ts';
import { isbnExistsInLibrary } from '../utils/libraryUtils.ts';
import type { BookEntry } from '../types.ts';

export type ScanRequestOptions = {
  allowReview?: boolean;
  source?: 'scan' | 'manual' | 'ocr' | 'barcode' | 'suggestion';
};

export function useScanHandler(
  setOpenBookIsbn: (isbn: string | null) => void,
  setView: (view: 'scan' | 'library' | 'data' | 'profile') => void,
) {
  const { lookupByIsbn, loading, error } = useBookLookup();
  const { addBook, books } = useBookStore();
  const { user } = useAuthStore();
  const { preferences } = useProfileStore();
  const { online } = useOnlineStatus();
  const { toast, confirm } = useToast();
  const { track } = useAnalyticsStore();
  const batchMode = preferences.batchModeDefault;
  const batchBooksAddedRef = useRef(0);

  useEffect(() => {
    if (!batchMode) batchBooksAddedRef.current = 0;
  }, [batchMode]);

  const addBookAndOpen = useCallback((newBook: BookEntry, successMessage: string, trackMethod: string, forceOpen = false) => {
    addBook(newBook);
    track('book_added', { method: trackMethod, isbn: newBook.isbn });
    const viewLibrary = () => { setOpenBookIsbn(newBook.isbn); setView('library'); };
    if (batchMode && !forceOpen) {
      toast('Added. Ready for the next book.', 'success', 4000, undefined, { label: 'View in Library', onClick: viewLibrary });
      batchBooksAddedRef.current += 1;
      if (batchBooksAddedRef.current === 1) {
        toast("Batch mode: you'll stay on scanner. Tap Library when done.", 'info', 4500);
      }
    } else {
      toast(successMessage, 'success');
      setOpenBookIsbn(newBook.isbn);
      setView('library');
    }

    if (user && online) {
      void pushBooks(user.id, [...books, newBook]).catch(() => toast('Cloud sync failed. Changes saved locally.', 'warning'));
    }
  }, [addBook, batchMode, books, online, toast, track, user, setOpenBookIsbn, setView]);

  const handlePhotoCapture = useCallback((imageDataUrl: string) => {
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2);
    const photoIsbn = `photo-${id}`;
    const newBook: BookEntry = {
      id,
      isbn: photoIsbn,
      isPhotoOnly: true,
      title: 'Unknown Title',
      author: 'Unknown Author',
      pageCount: 0,
      amazonLink: '',
      coverImg: imageDataUrl,
      status: 'to-read',
      notes: '',
      dateAdded: new Date().toISOString(),
      shelfIds: [],
      needsReview: true,
      reviewReason: 'Photo-only capture. Add metadata when ready.',
    };
    addBook(newBook);
    track('book_added', { method: 'photo' });
    toast('Book added with photo. Edit details in your library.', 'success');
    if (user && online) {
      void pushBooks(user.id, [...books, newBook]).catch(() => toast('Cloud sync failed. Changes saved locally.', 'warning'));
    }
    setOpenBookIsbn(photoIsbn);
    setView('library');
  }, [addBook, books, user, online, toast, track, setOpenBookIsbn, setView]);

  const handleScan = async (isbn: string, options: ScanRequestOptions = {}) => {
    const normalizedInput = isbn.replace(/[^0-9Xx]/g, '').replace(/x$/i, 'X') || isbn;
    const isChecksumValid = isValidIsbn(normalizedInput);
    const canReviewInvalid = options.allowReview === true && !isChecksumValid;

    if (isbnExistsInLibrary(normalizedInput, books)) {
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
        setOpenBookIsbn(normalizedInput);
        setView('library');
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
      };

      addBookAndOpen(reviewBook, 'Added for review. Open the book to verify the ISBN and details.', 'manual_review', true);
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
        };
        addBookAndOpen(newBook, `Added "${metadata.title}" to your library.`, options.source === 'manual' ? 'manual' : 'scan', options.source === 'manual');
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
          };
          addBookAndOpen(newBook, 'Added with ISBN only. You can fill in the details in your library.', options.source === 'manual' ? 'manual_no_metadata' : 'scan_no_metadata', options.source === 'manual');
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
    handleScan,
    handlePhotoCapture,
    loading,
    error,
    batchMode,
  };
}
