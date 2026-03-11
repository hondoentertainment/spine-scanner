import { describe, it, expect } from 'vitest';
import type { BookEntry } from '../../types.ts';
import { FALLBACK_COVER_DATA_URL, getActiveLibraryFilterLabels, getBookCoverSrc, getLibraryInsights } from '../bookPresentation.ts';

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: crypto.randomUUID(),
  isbn: '9780141036144',
  title: '1984',
  author: 'George Orwell',
  pageCount: 328,
  amazonLink: '',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: '2026-01-15T00:00:00.000Z',
  shelfIds: [],
  ...overrides,
});

describe('bookPresentation', () => {
  it('returns a local fallback cover when no image is provided', () => {
    expect(getBookCoverSrc('')).toBe(FALLBACK_COVER_DATA_URL);
    expect(getBookCoverSrc(undefined)).toBe(FALLBACK_COVER_DATA_URL);
  });

  it('keeps a real cover url when present', () => {
    expect(getBookCoverSrc('https://example.com/cover.jpg')).toBe('https://example.com/cover.jpg');
  });

  it('summarizes reading progress and recent books', () => {
    const insights = getLibraryInsights([
      makeBook({ id: 'a', title: 'Read Book', status: 'read', pageCount: 300, dateAdded: '2026-01-01T00:00:00.000Z' }),
      makeBook({ id: 'b', title: 'Current Book', status: 'reading', pageCount: 250, dateAdded: '2026-03-01T00:00:00.000Z' }),
      makeBook({ id: 'c', title: 'Queue Book', status: 'to-read', pageCount: 200, dateAdded: '2026-02-01T00:00:00.000Z' }),
    ]);

    expect(insights.totalBooks).toBe(3);
    expect(insights.readCount).toBe(1);
    expect(insights.readingCount).toBe(1);
    expect(insights.toReadCount).toBe(1);
    expect(insights.pagesRead).toBe(300);
    expect(insights.completionRate).toBe(33);
    expect(insights.currentlyReading?.title).toBe('Current Book');
    expect(insights.recentlyAdded.map((book) => book.title)).toEqual(['Current Book', 'Queue Book', 'Read Book']);
  });

  it('builds user-facing active filter labels', () => {
    expect(getActiveLibraryFilterLabels({
      searchTerm: 'Gatsby',
      statusFilter: 'reading',
      shelfName: 'Favorites',
    })).toEqual(['Search: Gatsby', 'Status: reading', 'Shelf: Favorites']);
  });

  it('omits empty filters', () => {
    expect(getActiveLibraryFilterLabels({
      searchTerm: '   ',
      statusFilter: 'all',
      shelfName: null,
    })).toEqual([]);
  });
});