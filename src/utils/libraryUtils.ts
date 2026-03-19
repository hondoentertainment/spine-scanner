import { normalizeToIsbn13 } from './isbnValidation.ts';
import type { BookEntry } from '../types.ts';

/** Check if a string is a photo-only book identifier (not a real ISBN). */
export const isPhotoId = (id: string): boolean =>
  typeof id === 'string' && id.startsWith('photo-');

/** Check if a book is photo-only (no ISBN). Handles legacy data without isPhotoOnly field. */
export const isBookPhotoOnly = (book: BookEntry): boolean =>
  book.isPhotoOnly === true || isPhotoId(book.isbn);

/**
 * Returns true if the given ISBN already exists in the library,
 * using canonical ISBN-13 comparison. ISBN-10 and ISBN-13 for the same book
 * are treated as duplicates. Photo-only books are excluded from the check.
 */
export const isbnExistsInLibrary = (isbn: string, books: BookEntry[]): boolean => {
  if (isPhotoId(isbn)) return false;
  const canonical = normalizeToIsbn13(isbn);
  return books.some((b) => {
    if (b.deletedAt) return false;
    if (b.isPhotoOnly || isPhotoId(b.isbn)) return false;
    return normalizeToIsbn13(b.isbn) === canonical;
  });
};
