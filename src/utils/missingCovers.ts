import type { BookEntry } from '../types.ts';
import { hasRealCover } from './bookPresentation.ts';
import { isBookPhotoOnly } from './libraryUtils.ts';

/**
 * Books eligible for targeted cover recovery: no real cover image, a real
 * ISBN to look up, and no user-authored cover choice to preserve.
 * Photo-only books are excluded — their capture photo is their cover.
 */
export function findBooksMissingCovers(books: BookEntry[]): BookEntry[] {
  return books.filter(
    (book) =>
      !hasRealCover(book.coverImg) &&
      !isBookPhotoOnly(book) &&
      !(book.userEditedFields?.coverImg ?? book.metadataUserEdited?.coverImg),
  );
}

/**
 * Reduce a full metadata-refresh result to just a cover update.
 * Returns null when the refresh produced no usable cover, so callers can
 * count "recovered" vs "still missing" accurately.
 */
export function extractCoverUpdate(
  refreshed: Partial<BookEntry> | null,
): Pick<BookEntry, 'coverImg'> | null {
  if (!refreshed || !hasRealCover(refreshed.coverImg)) return null;
  return { coverImg: refreshed.coverImg as string };
}
