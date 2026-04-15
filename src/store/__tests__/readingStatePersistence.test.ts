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

import { getReadingProgressPercent, updateBookForStatus, updateBookProgress, normalizeBookEntry } from '../../utils/bookState';

describe('getReadingProgressPercent', () => {
  const makeProgressBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
    id: 'p1', isbn: '123', title: 'T', author: 'A', pageCount: 200,
    amazonLink: '', coverImg: '', status: 'reading', notes: '',
    dateAdded: new Date().toISOString(), shelfIds: [],
    ...overrides,
  });

  it('returns 0 when pageCount is 0 and status is not read', () => {
    expect(getReadingProgressPercent(makeProgressBook({ pageCount: 0, status: 'to-read' }))).toBe(0);
  });

  it('returns 100 when pageCount is 0 and status is read', () => {
    expect(getReadingProgressPercent(makeProgressBook({ pageCount: 0, status: 'read' }))).toBe(100);
  });

  it('returns percent based on pagesFinished / pageCount', () => {
    expect(getReadingProgressPercent(makeProgressBook({ pageCount: 200, pagesFinished: 100 }))).toBe(50);
  });

  it('returns 0 when pagesFinished is undefined', () => {
    expect(getReadingProgressPercent(makeProgressBook({ pageCount: 200, pagesFinished: undefined }))).toBe(0);
  });

  it('returns 100 when pagesFinished equals pageCount', () => {
    expect(getReadingProgressPercent(makeProgressBook({ pageCount: 200, pagesFinished: 200 }))).toBe(100);
  });
});

describe('updateBookForStatus', () => {
  const makeBase = (overrides: Partial<BookEntry> = {}): BookEntry => ({
    id: 'b1', isbn: '123', title: 'T', author: 'A', pageCount: 200,
    amazonLink: '', coverImg: '', status: 'to-read', notes: '',
    dateAdded: '2026-01-01T00:00:00.000Z', shelfIds: [],
    ...overrides,
  });

  it('resets pagesFinished and dates when status changes to to-read', () => {
    const result = updateBookForStatus(makeBase({ status: 'reading', pagesFinished: 50 }), 'to-read');
    expect(result.status).toBe('to-read');
    expect(result.pagesFinished).toBe(0);
    expect(result.startedAt).toBeNull();
    expect(result.finishedAt).toBeNull();
  });

  it('sets finishedAt when status changes to read', () => {
    const result = updateBookForStatus(makeBase(), 'read');
    expect(result.status).toBe('read');
    expect(result.finishedAt).not.toBeNull();
    expect(result.pagesFinished).toBe(200);
  });

  it('preserves startedAt when already set on read transition', () => {
    const started = '2026-03-01T00:00:00.000Z';
    const result = updateBookForStatus(makeBase({ startedAt: started }), 'read');
    expect(result.startedAt).toBe(started);
  });

  it('sets pagesFinished to 0 when pageCount is 0 on read', () => {
    const result = updateBookForStatus(makeBase({ pageCount: 0, pagesFinished: 0 }), 'read');
    expect(result.status).toBe('read');
    expect(result.pagesFinished).toBe(0);
  });

  it('sets startedAt when moving to reading and it was not set', () => {
    const result = updateBookForStatus(makeBase({ startedAt: null }), 'reading');
    expect(result.status).toBe('reading');
    expect(result.startedAt).not.toBeNull();
    expect(result.finishedAt).toBeNull();
  });

  it('transitions to dnf without modifying startedAt/finishedAt specially', () => {
    const result = updateBookForStatus(makeBase(), 'dnf');
    expect(result.status).toBe('dnf');
  });

  it('sets startedAt for dnf when pagesFinished > 0', () => {
    const result = updateBookForStatus(makeBase({ pagesFinished: 50 }), 'dnf');
    expect(result.startedAt).not.toBeNull();
  });
});

describe('updateBookProgress', () => {
  const makeBase = (overrides: Partial<BookEntry> = {}): BookEntry => ({
    id: 'b1', isbn: '123', title: 'T', author: 'A', pageCount: 200,
    amazonLink: '', coverImg: '', status: 'to-read', notes: '',
    dateAdded: '2026-01-01T00:00:00.000Z', shelfIds: [],
    ...overrides,
  });

  it('moves book to read when progress reaches pageCount', () => {
    const result = updateBookProgress(makeBase(), 200);
    expect(result.status).toBe('read');
    expect(result.pagesFinished).toBe(200);
  });

  it('moves book to reading when progress > 0 and was to-read', () => {
    const result = updateBookProgress(makeBase(), 50);
    expect(result.status).toBe('reading');
    expect(result.pagesFinished).toBe(50);
  });

  it('clamps progress to pageCount', () => {
    const result = updateBookProgress(makeBase(), 999);
    expect(result.pagesFinished).toBe(200);
    expect(result.status).toBe('read');
  });

  it('allows progress with no pageCount (unbounded)', () => {
    const result = updateBookProgress(makeBase({ pageCount: 0 }), 50);
    expect(result.pagesFinished).toBe(50);
  });

  it('does not move to reading when progress is 0', () => {
    const result = updateBookProgress(makeBase({ status: 'to-read' }), 0);
    expect(result.status).toBe('to-read');
    expect(result.pagesFinished).toBe(0);
  });

  it('sets startedAt when pagesFinished > 0 and startedAt was null', () => {
    const result = updateBookProgress(makeBase({ startedAt: null }), 10);
    expect(result.startedAt).not.toBeNull();
  });

  it('keeps existing startedAt when progress is 0', () => {
    const result = updateBookProgress(makeBase({ startedAt: null }), 0);
    expect(result.startedAt).toBeNull();
  });
});

describe('normalizeBookEntry', () => {
  const makeBase = (overrides: Partial<BookEntry> = {}): BookEntry => ({
    id: 'n1', isbn: '123', title: 'T', author: 'A', pageCount: 200,
    amazonLink: '', coverImg: '', status: 'to-read', notes: '',
    dateAdded: '2026-01-01T00:00:00.000Z', shelfIds: [],
    ...overrides,
  });

  it('caps pagesFinished at pageCount', () => {
    const result = normalizeBookEntry(makeBase({ pagesFinished: 999 }));
    expect(result.pagesFinished).toBe(200); // clamped to pageCount
  });

  it('sets needsReview for photo-only books', () => {
    const result = normalizeBookEntry(makeBase({ isPhotoOnly: true }));
    expect(result.needsReview).toBe(true);
  });

  it('sets needsReview when title is Unknown Title', () => {
    const result = normalizeBookEntry(makeBase({ title: 'Unknown Title' }));
    expect(result.needsReview).toBe(true);
  });

  it('does not set needsReview when needsReview is explicitly false', () => {
    const result = normalizeBookEntry(makeBase({ needsReview: false, title: 'Unknown Title' }));
    expect(result.needsReview).toBe(false);
  });

  it('sets needsReview true when reason is non-empty', () => {
    const result = normalizeBookEntry(makeBase({ reviewReason: 'bad scan' }));
    expect(result.needsReview).toBe(true);
  });

  it('preserves finishedAt for read books', () => {
    const finished = '2026-02-01T00:00:00.000Z';
    const result = normalizeBookEntry(makeBase({ status: 'read', finishedAt: finished }));
    expect(result.finishedAt).toBe(finished);
  });

  it('sets finishedAt from dateAdded for read books without finishedAt', () => {
    const result = normalizeBookEntry(makeBase({ status: 'read', finishedAt: null }));
    expect(result.finishedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('clears finishedAt for non-read books', () => {
    const result = normalizeBookEntry(makeBase({ status: 'reading', finishedAt: '2026-01-01T00:00:00.000Z' }));
    expect(result.finishedAt).toBeNull();
  });

  it('normalizes highlights array', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = normalizeBookEntry(makeBase({ highlights: ['  trim me  ', '', null as any, 'keep'] }));
    expect(result.highlights).toEqual(['trim me', 'keep']);
  });

  it('handles non-array highlights gracefully', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = normalizeBookEntry(makeBase({ highlights: 'not an array' as any }));
    expect(result.highlights).toEqual([]);
  });

  it('normalizes seriesIndex as undefined when not a number', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = normalizeBookEntry(makeBase({ seriesIndex: 'not a number' as any }));
    expect(result.seriesIndex).toBeUndefined();
  });

  it('normalizes seriesIndex as undefined when NaN', () => {
    const result = normalizeBookEntry(makeBase({ seriesIndex: NaN }));
    expect(result.seriesIndex).toBeUndefined();
  });

  it('normalizes seriesName as undefined when empty', () => {
    const result = normalizeBookEntry(makeBase({ seriesName: '  ' }));
    expect(result.seriesName).toBeUndefined();
  });
});
