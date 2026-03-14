import type { BookEntry } from '../types.ts';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

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

  return {
    ...book,
    isPhotoOnly: book.isPhotoOnly === true,
    shelfIds: Array.isArray(book.shelfIds) ? book.shelfIds : [],
    needsReview: inferNeedsReview(book),
    reviewReason: book.reviewReason ?? '',
    pagesFinished: book.status === 'read' && pageCount > 0 ? pageCount : pagesFinished,
    startedAt,
    finishedAt,
    lastProgressAt: book.lastProgressAt ?? null,
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
