import { describe, it, expect, beforeEach } from 'vitest';
import { useBookStore } from '../useBookStore';
import type { BookEntry } from '../../types';

/**
 * ─── 2a. State Persistence ───────────────────────────────────────
 *
 * Test: Mark a book as "Reading" and then trigger a manual metadata
 * refresh (updateBook with new metadata fields).
 *
 * Success: The reading status remains "Reading" and is NOT overwritten
 * by the default "to-read" state from the API or import pipeline.
 */

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'persist-1',
  isbn: '9780141036144',
  title: 'The Great Gatsby',
  author: 'F. Scott Fitzgerald',
  pageCount: 180,
  amazonLink: 'https://amazon.com/s?k=9780141036144',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: new Date().toISOString(),
  shelfIds: [],
  ...overrides,
});

describe('Reading Status Persistence', () => {
  beforeEach(() => {
    useBookStore.setState({ books: [], shelves: [] });
  });

  it('preserves "reading" status when metadata fields are updated', () => {
    const book = makeBook({ status: 'reading' });
    useBookStore.getState().addBook(book);

    // Simulate a metadata refresh — only updates title, pageCount, coverImg
    // Status should NOT be included in the update payload
    useBookStore.getState().updateBook(book.id, {
      title: 'The Great Gatsby (Updated Edition)',
      pageCount: 192,
      coverImg: 'https://new-cover.jpg',
    });

    const updated = useBookStore.getState().books[0];
    expect(updated.status).toBe('reading'); // NOT overwritten to 'to-read'
    expect(updated.title).toBe('The Great Gatsby (Updated Edition)');
    expect(updated.pageCount).toBe(192);
  });

  it('preserves "read" status during metadata refresh', () => {
    const book = makeBook({ status: 'read', notes: 'My favorite' });
    useBookStore.getState().addBook(book);

    useBookStore.getState().updateBook(book.id, {
      author: 'F. Scott Fitzgerald (updated)',
    });

    const updated = useBookStore.getState().books[0];
    expect(updated.status).toBe('read');
    expect(updated.notes).toBe('My favorite'); // Notes also preserved
  });

  it('preserves "dnf" status during metadata refresh', () => {
    const book = makeBook({ status: 'dnf' });
    useBookStore.getState().addBook(book);

    useBookStore.getState().updateBook(book.id, {
      pageCount: 999,
    });

    expect(useBookStore.getState().books[0].status).toBe('dnf');
  });

  it('preserves notes during metadata refresh', () => {
    const book = makeBook({
      status: 'reading',
      notes: 'Currently on chapter 5 — the green light symbolism is incredible',
    });
    useBookStore.getState().addBook(book);

    // Metadata refresh updates only API-sourced fields
    useBookStore.getState().updateBook(book.id, {
      title: 'The Great Gatsby',
      pageCount: 180,
      amazonLink: 'https://new-link.com',
    });

    const updated = useBookStore.getState().books[0];
    expect(updated.notes).toBe('Currently on chapter 5 — the green light symbolism is incredible');
    expect(updated.status).toBe('reading');
  });

  it('preserves shelf assignments during metadata refresh', () => {
    const book = makeBook({ shelfIds: ['shelf-fiction', 'shelf-favorites'] });
    useBookStore.getState().addBook(book);

    useBookStore.getState().updateBook(book.id, {
      pageCount: 200,
      coverImg: 'new-cover.jpg',
    });

    expect(useBookStore.getState().books[0].shelfIds).toEqual(['shelf-fiction', 'shelf-favorites']);
  });

  it('allows explicit status change via updateBookStatus', () => {
    const book = makeBook({ status: 'to-read' });
    useBookStore.getState().addBook(book);

    // User deliberately changes status — this SHOULD work
    useBookStore.getState().updateBookStatus(book.id, 'reading');
    expect(useBookStore.getState().books[0].status).toBe('reading');

    useBookStore.getState().updateBookStatus(book.id, 'read');
    expect(useBookStore.getState().books[0].status).toBe('read');
  });

  it('updateBook with status explicitly set DOES change status', () => {
    const book = makeBook({ status: 'reading' });
    useBookStore.getState().addBook(book);

    // If someone passes status in updateBook, it SHOULD update
    useBookStore.getState().updateBook(book.id, { status: 'read' });
    expect(useBookStore.getState().books[0].status).toBe('read');
  });

  it('does not affect other books when refreshing one', () => {
    useBookStore.getState().addBook(makeBook({ id: 'b1', status: 'reading' }));
    useBookStore.getState().addBook(makeBook({ id: 'b2', status: 'read' }));
    useBookStore.getState().addBook(makeBook({ id: 'b3', status: 'dnf' }));

    // Refresh metadata for b1 only
    useBookStore.getState().updateBook('b1', { pageCount: 999 });

    expect(useBookStore.getState().books.find(b => b.id === 'b1')?.status).toBe('reading');
    expect(useBookStore.getState().books.find(b => b.id === 'b2')?.status).toBe('read');
    expect(useBookStore.getState().books.find(b => b.id === 'b3')?.status).toBe('dnf');
  });

  it('preserves dateAdded during metadata refresh (not reset to "now")', () => {
    const originalDate = '2024-01-15T00:00:00.000Z';
    const book = makeBook({ dateAdded: originalDate });
    useBookStore.getState().addBook(book);

    useBookStore.getState().updateBook(book.id, {
      title: 'Refreshed Title',
    });

    expect(useBookStore.getState().books[0].dateAdded).toBe(originalDate);
  });
});
