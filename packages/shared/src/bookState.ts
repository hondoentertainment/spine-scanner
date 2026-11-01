import type { BookEntry } from './types';
import { lendingFields } from './loans';
import { normalizePhysicalLocation } from './physicalLocation';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Shown until someone fills in a book that was added from a photo. */
export const PHOTO_ONLY_REVIEW_REASON = 'Photo-only capture. Add metadata when ready.';

/**
 * A book saved from one photo, with no ISBN lookup.
 * Title is optional. `isPhotoOnly` and `needsReview` match the web capture path.
 */
export function createPhotoOnlyBook(input: {
  id: string;
  title?: string | null;
  coverImg?: string | null;
  dateAdded?: string;
}): BookEntry {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const coverImg = typeof input.coverImg === 'string' ? input.coverImg.trim() : '';
  return {
    id: input.id,
    isbn: `photo-${input.id}`,
    isPhotoOnly: true,
    title: title || 'Unknown Title',
    author: 'Unknown Author',
    pageCount: 0,
    amazonLink: '',
    coverImg,
    status: 'to-read',
    notes: '',
    dateAdded: input.dateAdded ?? new Date().toISOString(),
    shelfIds: [],
    needsReview: true,
    reviewReason: PHOTO_ONLY_REVIEW_REASON,
    metadataSource: 'manual',
  };
}

export function inferNeedsReview(book: Partial<BookEntry>): boolean {
  if (book.needsReview === true) return true;
  if (book.needsReview === false) return false;
  if (book.isPhotoOnly) return true;
  const title = (book.title ?? '').trim().toLowerCase();
  const author = (book.author ?? '').trim().toLowerCase();
  const reason = (book.reviewReason ?? '').trim().toLowerCase();

  return (
    title === 'review isbn entry' ||
    title === 'unknown title' ||
    author === 'unknown author' ||
    reason.length > 0
  );
}

export function normalizeBookEntry(book: BookEntry): BookEntry {
  const pageCount = Math.max(0, book.pageCount || 0);
  const rawPagesFinished = typeof book.pagesFinished === 'number' ? book.pagesFinished : 0;
  const maxPages = pageCount > 0 ? pageCount : Math.max(rawPagesFinished, 0);
  const pagesFinished = clamp(rawPagesFinished, 0, maxPages);

  const finishedAt = book.status === 'read'
    ? book.finishedAt ?? new Date(book.dateAdded).toISOString()
    : null;

  const startedAt = book.status === 'reading' || pagesFinished > 0 || book.status === 'read'
    ? book.startedAt ?? book.dateAdded
    : null;

  const rawHighlights = Array.isArray(book.highlights)
    ? book.highlights.filter((h): h is string => typeof h === 'string').map((h) => h.trim()).filter(Boolean)
    : [];
  const seriesNameRaw = typeof book.seriesName === 'string' ? book.seriesName.trim() : '';
  const seriesIndexRaw = typeof book.seriesIndex === 'number' && !Number.isNaN(book.seriesIndex) ? book.seriesIndex : undefined;

  return {
    ...book,
    isPhotoOnly: book.isPhotoOnly === true,
    shelfIds: Array.isArray(book.shelfIds) ? book.shelfIds : [],
    highlights: rawHighlights,
    seriesName: seriesNameRaw || undefined,
    seriesIndex: seriesIndexRaw,
    needsReview: inferNeedsReview(book),
    reviewReason: book.reviewReason ?? '',
    pagesFinished: book.status === 'read' && pageCount > 0 ? pageCount : pagesFinished,
    startedAt,
    finishedAt,
    lastProgressAt: book.lastProgressAt ?? null,
    ...normalizePhysicalLocation(book),
    ...lendingFields(book),
  };
}

export function normalizeBooks(books: BookEntry[]): BookEntry[] {
  return books.map(normalizeBookEntry);
}

export function updateBookForStatus(book: BookEntry, status: BookEntry['status']): BookEntry {
  const now = new Date().toISOString();
  if (status === 'to-read') {
    return normalizeBookEntry({
      ...book,
      status,
      pagesFinished: 0,
      startedAt: null,
      finishedAt: null,
      lastProgressAt: book.lastProgressAt ?? null,
    });
  }

  if (status === 'reading') {
    return normalizeBookEntry({
      ...book,
      status,
      startedAt: book.startedAt ?? now,
      finishedAt: null,
      pagesFinished: book.pagesFinished && book.pagesFinished > 0 ? book.pagesFinished : 0,
      lastProgressAt: now,
    });
  }

  if (status === 'read') {
    return normalizeBookEntry({
      ...book,
      status,
      startedAt: book.startedAt ?? now,
      finishedAt: now,
      pagesFinished: book.pageCount > 0 ? book.pageCount : Math.max(book.pagesFinished ?? 0, 0),
      lastProgressAt: now,
    });
  }

  return normalizeBookEntry({
    ...book,
    status,
    startedAt: book.startedAt ?? (book.pagesFinished && book.pagesFinished > 0 ? now : null),
    finishedAt: null,
    lastProgressAt: now,
  });
}

export function updateBookProgress(book: BookEntry, nextPagesFinished: number): BookEntry {
  const now = new Date().toISOString();
  const safePageCount = Math.max(0, book.pageCount || 0);
  const capped = safePageCount > 0
    ? clamp(nextPagesFinished, 0, safePageCount)
    : Math.max(0, nextPagesFinished);

  if (safePageCount > 0 && capped >= safePageCount) {
    return updateBookForStatus({
      ...book,
      pagesFinished: safePageCount,
      startedAt: book.startedAt ?? now,
      lastProgressAt: now,
    }, 'read');
  }

  const nextStatus = capped > 0 && book.status === 'to-read' ? 'reading' : book.status;

  return normalizeBookEntry({
    ...book,
    status: nextStatus,
    pagesFinished: capped,
    startedAt: capped > 0 ? book.startedAt ?? now : book.startedAt ?? null,
    finishedAt: nextStatus === 'read' ? book.finishedAt ?? now : null,
    lastProgressAt: now,
  });
}

export function getReadingProgressPercent(book: BookEntry): number {
  if (!book.pageCount || book.pageCount <= 0) {
    return book.status === 'read' ? 100 : 0;
  }

  return Math.round(((book.pagesFinished ?? 0) / book.pageCount) * 100);
}
