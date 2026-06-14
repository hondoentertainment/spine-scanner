import type { BookEntry, BookLookupResult, BookMetadata } from '../types.ts';
import { generateAmazonLink } from '../utils/amazonLink.ts';
import { hasRealCover } from '../utils/bookPresentation.ts';
import { getMetadataConflictFlags } from './metadataPeers.ts';
import { applyMetadataRefresh } from './metadataRefresh.ts';
import { getUserEditedFields } from './userEditedFields.ts';

export function toBookLookupResult(
  meta: BookMetadata,
  google: BookMetadata | null,
  openLibrary: BookMetadata | null,
): BookLookupResult {
  return {
    title: meta.title,
    authors: meta.authors,
    pageCount: meta.pageCount,
    thumbnail: meta.thumbnail,
    isbn: meta.isbn,
    metadataSource: meta.source ?? 'manual',
    google,
    openLibrary,
  };
}

export function buildMetadataRefreshUpdates(
  book: BookEntry,
  meta: BookMetadata,
  google: BookMetadata | null,
  openLibrary: BookMetadata | null,
): { updates: Partial<BookEntry>; reviewReasons: string[] } {
  const lookup = toBookLookupResult(meta, google, openLibrary);
  const bookForRefresh: BookEntry = {
    ...book,
    metadataUserEdited: getUserEditedFields(book),
  };
  const updates = applyMetadataRefresh(bookForRefresh, lookup);
  if (updates.metadataUserEdited) {
    updates.userEditedFields = updates.metadataUserEdited;
  }

  const reviewReasons: string[] = [];
  if (meta.editionFallback) {
    reviewReasons.push(`Matched alternate ISBN edition ${meta.matchedIsbn ?? meta.isbn}.`);
  }
  if (meta.conflicts?.length) {
    const fields = [...new Set(meta.conflicts.flatMap((conflict) => conflict.reasons))].join(', ');
    reviewReasons.push(`Metadata providers disagree on ${fields}.`);
  }

  const mergedCover = updates.coverImg ?? book.coverImg;
  if (!hasRealCover(mergedCover)) {
    reviewReasons.push('No cover image found.');
  }

  const peersBook: BookEntry = { ...book, ...updates };
  const conflictFlags = getMetadataConflictFlags(peersBook);
  const hasPeerConflict = conflictFlags.author || conflictFlags.pageCount || conflictFlags.title;

  if (reviewReasons.length > 0 || hasPeerConflict) {
    updates.needsReview = true;
    updates.reviewReason = reviewReasons.length > 0
      ? reviewReasons.join(' ')
      : 'Metadata providers disagree — pick a source below.';
  }

  return { updates, reviewReasons };
}

/** Try peer snapshots or a fresh lookup thumbnail when the row has no real cover. */
export function recoverCoverFromBook(
  book: BookEntry,
  meta?: BookMetadata | null,
): Partial<BookEntry> | null {
  const edited = getUserEditedFields(book);
  if (edited.coverImg) return null;

  const fromPeers =
    book.metadataPeers?.google?.thumbnail?.trim()
    || book.metadataPeers?.openLibrary?.thumbnail?.trim()
    || '';
  const fromMeta = meta?.thumbnail?.trim() || '';
  const fromConflicts = meta?.conflicts?.find((c) => c.thumbnail)?.thumbnail?.trim() || '';
  const next = fromPeers || fromMeta || fromConflicts;
  if (!hasRealCover(next)) return null;

  const updates: Partial<BookEntry> = {
    coverImg: next,
    amazonLink: generateAmazonLink(book.isbn),
  };
  if (book.reviewReason?.toLowerCase().includes('cover')) {
    updates.needsReview = false;
    updates.reviewReason = '';
  }
  return updates;
}
