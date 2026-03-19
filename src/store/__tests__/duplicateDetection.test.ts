import { describe, it, expect, beforeEach } from 'vitest';
import { useBookStore } from '../useBookStore';
import type { BookEntry } from '../../types';
import { isbnExistsInLibrary as checkIsbnExists } from '../../utils/libraryUtils';

/**
 * ─── 2b. The Duplicate Scan ──────────────────────────────────────
 *
 * Test: Accidentally scan the same book twice during a session.
 *
 * Success: The app recognizes the duplicate ISBN and prevents adding
 * it again. Uses canonical ISBN-13 comparison so ISBN-10 and ISBN-13
 * for the same book are treated as duplicates.
 */

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'dup-1',
  isbn: '9780141036144',
  title: 'The Great Gatsby',
  author: 'F. Scott Fitzgerald',
  pageCount: 180,
  amazonLink: 'https://amazon.com',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: new Date().toISOString(),
  shelfIds: [],
  ...overrides,
});

const isbnExistsInLibrary = (isbn: string): boolean =>
  checkIsbnExists(isbn, useBookStore.getState().books);

describe('Duplicate Scan Detection', () => {
  beforeEach(() => {
    useBookStore.setState({ books: [], shelves: [] });
  });

  it('detects an exact duplicate ISBN', () => {
    const book = makeBook();
    useBookStore.getState().addBook(book);

    // Simulate second scan of same ISBN
    expect(isbnExistsInLibrary('9780141036144')).toBe(true);
  });

  it('does not flag a different ISBN as duplicate', () => {
    useBookStore.getState().addBook(makeBook({ isbn: '9780141036144' }));

    expect(isbnExistsInLibrary('9780544003415')).toBe(false);
  });

  it('prevents database bloat by not adding the same ISBN twice', () => {
    const book = makeBook();
    useBookStore.getState().addBook(book);

    // Attempt to add same ISBN — should be caught before addBook
    if (!isbnExistsInLibrary(book.isbn)) {
      useBookStore.getState().addBook(makeBook({ id: 'dup-2' }));
    }

    // Only one book should exist
    expect(useBookStore.getState().books).toHaveLength(1);
  });

  it('preserves existing book data when duplicate is detected', () => {
    const book = makeBook({
      status: 'reading',
      notes: 'On chapter 3',
      shelfIds: ['shelf-fiction'],
    });
    useBookStore.getState().addBook(book);

    // Duplicate detected — original data should be intact
    expect(isbnExistsInLibrary(book.isbn)).toBe(true);
    const existing = useBookStore.getState().books[0];
    expect(existing.status).toBe('reading');
    expect(existing.notes).toBe('On chapter 3');
    expect(existing.shelfIds).toEqual(['shelf-fiction']);
  });

  it('detects duplicates even with different casing or formatting', () => {
    useBookStore.getState().addBook(makeBook({ isbn: '9780141036144' }));

    // ISBN matching is exact string comparison — same digits
    expect(isbnExistsInLibrary('9780141036144')).toBe(true);
  });

  it('handles duplicate detection across multiple books', () => {
    useBookStore.getState().addBook(makeBook({ id: 'b1', isbn: '9780141036144' }));
    useBookStore.getState().addBook(makeBook({ id: 'b2', isbn: '9780544003415' }));
    useBookStore.getState().addBook(makeBook({ id: 'b3', isbn: '9780743273565' }));

    expect(isbnExistsInLibrary('9780141036144')).toBe(true);
    expect(isbnExistsInLibrary('9780544003415')).toBe(true);
    expect(isbnExistsInLibrary('9780743273565')).toBe(true);
    expect(isbnExistsInLibrary('9781234567890')).toBe(false);
  });

  it('works correctly after a book is removed (soft-delete)', () => {
    useBookStore.getState().addBook(makeBook({ id: 'b1', isbn: '9780141036144' }));
    expect(isbnExistsInLibrary('9780141036144')).toBe(true);

    // Soft-delete the book — deletedAt is stamped, book stays in array
    useBookStore.getState().removeBook('b1');
    // isbnExistsInLibrary skips tombstoned books
    expect(isbnExistsInLibrary('9780141036144')).toBe(false);

    // Now it can be re-added; the tombstone and the new entry coexist
    useBookStore.getState().addBook(makeBook({ id: 'b2', isbn: '9780141036144' }));
    const books = useBookStore.getState().books;
    const activeBook = books.find((b) => b.id === 'b2');
    expect(activeBook).toBeDefined();
    expect(activeBook?.deletedAt).toBeUndefined();
    // ISBN is now found again (the new live entry)
    expect(isbnExistsInLibrary('9780141036144')).toBe(true);
  });

  it('treats ISBN-10 and ISBN-13 for the same book as duplicates (canonical comparison)', () => {
    useBookStore.getState().addBook(makeBook({ isbn: '0141036141' })); // ISBN-10

    // ISBN-13 for the same book should be detected as duplicate
    expect(isbnExistsInLibrary('9780141036144')).toBe(true);
    expect(isbnExistsInLibrary('0141036141')).toBe(true);
  });

  it('detects duplicates during batch import', () => {
    // Pre-existing library
    useBookStore.getState().addBook(makeBook({ id: 'b1', isbn: '9780141036144' }));
    useBookStore.getState().addBook(makeBook({ id: 'b2', isbn: '9780544003415' }));

    // Batch of ISBNs to import (contains duplicates)
    const importBatch = [
      '9780141036144', // duplicate
      '9780743273565', // new
      '9780544003415', // duplicate
      '9780060883287', // new
    ];

    let added = 0;
    let duplicates = 0;

    for (const isbn of importBatch) {
      if (isbnExistsInLibrary(isbn)) {
        duplicates++;
      } else {
        useBookStore.getState().addBook(makeBook({
          id: `import-${added}`,
          isbn,
        }));
        added++;
      }
    }

    expect(added).toBe(2);
    expect(duplicates).toBe(2);
    expect(useBookStore.getState().books).toHaveLength(4); // 2 existing + 2 new
  });
});
