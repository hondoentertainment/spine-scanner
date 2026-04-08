import type { BookEntry } from '../types.ts';
import { normalizeToIsbn13 } from './isbnValidation.ts';
import { isBookPhotoOnly } from './libraryUtils.ts';

export interface DuplicateIsbnGroup {
  /** Canonical ISBN-13 key for the group. */
  key: string;
  books: BookEntry[];
}

/** Groups non–photo-only books that share the same canonical ISBN (2+ entries). */
export function findDuplicateIsbnGroups(books: BookEntry[]): DuplicateIsbnGroup[] {
  const map = new Map<string, BookEntry[]>();
  for (const book of books) {
    if (isBookPhotoOnly(book)) continue;
    const key = normalizeToIsbn13(book.isbn);
    const list = map.get(key);
    if (list) list.push(book);
    else map.set(key, [book]);
  }
  return [...map.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({ key, books: list }));
}
