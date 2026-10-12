import type { BookEntry } from '../types.ts';
import { generateAmazonLink } from '../utils/amazonLink.ts';
import { isValidIsbn, normalizeToIsbn13 } from '../utils/isbnValidation.ts';
import { isbnExistsInLibrary } from '../utils/libraryUtils.ts';
import type { ShelfReviewItem } from './types.ts';

export interface ShelfImportResult {
  books: BookEntry[];
  skippedDuplicates: number;
}

export interface ShelfImportOptions {
  now?: string;
  createId?: () => string;
}

const createBookId = (): string => (
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
);

const cleanIsbn = (value: string): string => value.replace(/[^0-9Xx]/g, '').replace(/x$/i, 'X');

/**
 * Turn accepted review rows into library entries.
 * Rejected rows are dropped. An ISBN already in the library is skipped.
 * Rows without a valid ISBN become photo-only books so they stay editable offline.
 */
export function shelfItemsToBooks(
  items: ShelfReviewItem[],
  existing: BookEntry[] = [],
  options: ShelfImportOptions = {},
): ShelfImportResult {
  const now = options.now ?? new Date().toISOString();
  const createId = options.createId ?? createBookId;
  const books: BookEntry[] = [];
  let skippedDuplicates = 0;
  const library = [...existing];

  for (const item of items) {
    if (item.decision !== 'accept') continue;
    const title = item.title.trim() || 'Unknown Title';
    const author = item.author.trim() || 'Unknown Author';
    const isbn = cleanIsbn(item.isbn);
    const validIsbn = (isbn.length === 10 || isbn.length === 13) && isValidIsbn(isbn);

    if (validIsbn) {
      const isbn13 = normalizeToIsbn13(isbn);
      if (isbnExistsInLibrary(isbn13, library)) {
        skippedDuplicates += 1;
        continue;
      }
      const needsReview = title.toLowerCase() === 'unknown title'
        || author.toLowerCase() === 'unknown author'
        || item.detectionMethod === 'text-search'
        || item.detectionMethod === 'vision';
      const book: BookEntry = {
        id: createId(),
        isbn: isbn13,
        title,
        author,
        pageCount: Math.max(0, item.pageCount || 0),
        amazonLink: generateAmazonLink(isbn13),
        coverImg: item.coverImg || item.previewUrl || '',
        status: 'to-read',
        notes: '',
        dateAdded: now,
        shelfIds: [],
        needsReview,
        reviewReason: needsReview
          ? (item.reviewReason || 'Imported from a shelf photo. Confirm the details.')
          : '',
        metadataSource: needsReview && item.metadataSource === 'manual' ? 'manual' : item.metadataSource,
      };
      books.push(book);
      library.push(book);
      continue;
    }

    const id = createId();
    const book: BookEntry = {
      id,
      isbn: `photo-${id}`,
      isPhotoOnly: true,
      title,
      author,
      pageCount: Math.max(0, item.pageCount || 0),
      amazonLink: '',
      coverImg: item.previewUrl || item.coverImg || '',
      status: 'to-read',
      notes: '',
      dateAdded: now,
      shelfIds: [],
      needsReview: true,
      reviewReason: item.reviewReason || 'Shelf photo had no confirmed ISBN. Add details when you can.',
      metadataSource: 'manual',
    };
    books.push(book);
    library.push(book);
  }

  return { books, skippedDuplicates };
}

export function importShelfBooks(
  items: ShelfReviewItem[],
  existing: BookEntry[],
  addBook: (book: BookEntry) => void,
  options: ShelfImportOptions = {},
): { added: BookEntry[]; skippedDuplicates: number } {
  const { books, skippedDuplicates } = shelfItemsToBooks(items, existing, options);
  for (const book of books) addBook(book);
  return { added: books, skippedDuplicates };
}
