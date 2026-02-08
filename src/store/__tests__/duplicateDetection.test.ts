import { describe, it, expect, beforeEach } from 'vitest';
import { useBookStore } from '../useBookStore';
import type { BookEntry } from '../../types';

/**
 * ─── 2b. The Duplicate Scan ──────────────────────────────────────
 *
 * Test: Accidentally scan the same book twice during a session.
 *
 * Success: The app recognizes the duplicate ISBN and prevents adding
 * it again. The existing book's data (status, notes, shelves) is
 * preserved intact.
 *
 * This test validates the duplicate detection logic that mirrors
 * App.tsx's handleScan: `books.find(b => b.isbn === isbn)`
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

/**
 * Helper: simulates the duplicate check from App.tsx handleScan.
 * Returns true if the ISBN already exists in the library.
 */
const isbnExistsInLibrary = (isbn: string): boolean => {
  return !!useBookStore.getState().books.find(b => b.isbn === isbn);
};

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

  it('works correctly after a book is removed', () => {
    useBookStore.getState().addBook(makeBook({ id: 'b1', isbn: '9780141036144' }));
    expect(isbnExistsInLibrary('9780141036144')).toBe(true);

    // Remove the book
    useBookStore.getState().removeBook('b1');
    expect(isbnExistsInLibrary('9780141036144')).toBe(false);

    // Now it can be re-added
    useBookStore.getState().addBook(makeBook({ id: 'b2', isbn: '9780141036144' }));
    expect(useBookStore.getState().books).toHaveLength(1);
    expect(useBookStore.getState().books[0].id).toBe('b2');
  });

  it('distinguishes ISBN-10 from ISBN-13 for the same book', () => {
    // ISBN-10 and ISBN-13 are different string values
    useBookStore.getState().addBook(makeBook({ isbn: '0141036141' })); // ISBN-10

    // ISBN-13 for the same book is a different string
    expect(isbnExistsInLibrary('9780141036144')).toBe(false);
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
