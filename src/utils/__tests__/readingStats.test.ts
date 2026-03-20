import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateReadingStats, getReadingStreak, getMonthlyReadingCounts } from '../readingStats';
import type { BookEntry } from '../../types';

/* ================================================================
 *  Helpers
 * ================================================================ */

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: `book-${Math.random().toString(36).slice(2, 8)}`,
  isbn: '9780141036144',
  title: 'Test Book',
  author: 'Test Author',
  pageCount: 300,
  amazonLink: '',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: '2026-01-15T00:00:00.000Z',
  shelfIds: [],
  ...overrides,
});

/* ================================================================
 *  calculateReadingStats
 * ================================================================ */

describe('calculateReadingStats', () => {
  it('returns zero stats for an empty library', () => {
    const stats = calculateReadingStats([]);
    expect(stats.booksReadThisYear).toBe(0);
    expect(stats.booksReadLastYear).toBe(0);
    expect(stats.totalPagesRead).toBe(0);
    expect(stats.averagePagesPerBook).toBe(0);
    expect(stats.averageRating).toBe(0);
    expect(stats.fastestRead).toBeNull();
    expect(stats.mostPagesRead).toBeNull();
    expect(stats.currentStreak).toBe(0);
    expect(stats.longestStreak).toBe(0);
  });

  it('returns zero stats when no books are finished', () => {
    const books = [
      makeBook({ status: 'reading' }),
      makeBook({ status: 'to-read' }),
    ];
    const stats = calculateReadingStats(books);
    expect(stats.booksReadThisYear).toBe(0);
    expect(stats.totalPagesRead).toBe(0);
    expect(stats.averagePagesPerBook).toBe(0);
  });

  it('counts books read this year based on finishedReading date', () => {
    const books = [
      makeBook({ status: 'read', finishedReading: '2026-02-10T00:00:00.000Z', pageCount: 200 }),
      makeBook({ status: 'read', finishedReading: '2026-03-05T00:00:00.000Z', pageCount: 400 }),
      makeBook({ status: 'read', finishedReading: '2025-11-20T00:00:00.000Z', pageCount: 300 }),
    ];
    const stats = calculateReadingStats(books);
    expect(stats.booksReadThisYear).toBe(2);
    expect(stats.booksReadLastYear).toBe(1);
  });

  it('calculates page statistics for read books', () => {
    const books = [
      makeBook({ status: 'read', pageCount: 200 }),
      makeBook({ status: 'read', pageCount: 400 }),
      makeBook({ status: 'reading', pageCount: 100 }),
    ];
    const stats = calculateReadingStats(books);
    expect(stats.totalPagesRead).toBe(600);
    expect(stats.averagePagesPerBook).toBe(300);
  });

  it('calculates yearly goal progress', () => {
    const books = [
      makeBook({ status: 'read', finishedReading: '2026-01-15T00:00:00.000Z' }),
      makeBook({ status: 'read', finishedReading: '2026-02-15T00:00:00.000Z' }),
      makeBook({ status: 'read', finishedReading: '2026-03-01T00:00:00.000Z' }),
    ];
    const stats = calculateReadingStats(books, 10);
    expect(stats.yearlyGoalProgress).toBe(30);
  });

  it('caps yearly goal at 100%', () => {
    const books = Array.from({ length: 12 }, (_, i) =>
      makeBook({ status: 'read', finishedReading: `2026-0${Math.min(i + 1, 9).toString().padStart(1, '0')}-15T00:00:00.000Z` })
    );
    const stats = calculateReadingStats(books, 5);
    expect(stats.yearlyGoalProgress).toBe(100);
  });

  it('returns 0 goal progress when no goal is set', () => {
    const books = [makeBook({ status: 'read', finishedReading: '2026-01-15T00:00:00.000Z' })];
    const stats = calculateReadingStats(books);
    expect(stats.yearlyGoalProgress).toBe(0);
  });

  it('calculates average rating', () => {
    const books = [
      makeBook({ rating: 4 }),
      makeBook({ rating: 5 }),
      makeBook({ rating: 3 }),
    ];
    const stats = calculateReadingStats(books);
    expect(stats.averageRating).toBe(4);
  });

  it('builds rating distribution', () => {
    const books = [
      makeBook({ rating: 5 }),
      makeBook({ rating: 5 }),
      makeBook({ rating: 3 }),
      makeBook({ rating: 1 }),
    ];
    const stats = calculateReadingStats(books);
    expect(stats.ratingDistribution[5]).toBe(2);
    expect(stats.ratingDistribution[3]).toBe(1);
    expect(stats.ratingDistribution[1]).toBe(1);
    expect(stats.ratingDistribution[2]).toBe(0);
    expect(stats.ratingDistribution[4]).toBe(0);
  });

  it('ignores invalid ratings', () => {
    const books = [
      makeBook({ rating: 0 }),
      makeBook({ rating: 6 }),
      makeBook({ rating: -1 }),
      makeBook({ rating: 4 }),
    ];
    const stats = calculateReadingStats(books);
    expect(stats.averageRating).toBe(4);
  });

  it('finds the fastest read', () => {
    const books = [
      makeBook({
        id: 'fast',
        status: 'read',
        startedReading: '2026-01-01T00:00:00.000Z',
        finishedReading: '2026-01-03T00:00:00.000Z',
      }),
      makeBook({
        id: 'slow',
        status: 'read',
        startedReading: '2026-01-01T00:00:00.000Z',
        finishedReading: '2026-01-20T00:00:00.000Z',
      }),
    ];
    const stats = calculateReadingStats(books);
    expect(stats.fastestRead?.id).toBe('fast');
  });

  it('finds the book with most pages among read books', () => {
    const books = [
      makeBook({ id: 'big', status: 'read', pageCount: 900 }),
      makeBook({ id: 'small', status: 'read', pageCount: 150 }),
      makeBook({ id: 'unread-big', status: 'to-read', pageCount: 2000 }),
    ];
    const stats = calculateReadingStats(books);
    expect(stats.mostPagesRead?.id).toBe('big');
  });

  it('returns 12 monthly reading entries', () => {
    const stats = calculateReadingStats([]);
    expect(stats.monthlyReading).toHaveLength(12);
  });
});

/* ================================================================
 *  getReadingStreak
 * ================================================================ */

describe('getReadingStreak', () => {
  let dateSpy: ReturnType<typeof vi.spyOn> | undefined;

  afterEach(() => {
    dateSpy?.mockRestore();
  });

  it('returns 0/0 for empty array', () => {
    expect(getReadingStreak([])).toEqual({ current: 0, longest: 0 });
  });

  it('returns 0/0 when no books are read', () => {
    const books = [makeBook({ status: 'reading' })];
    expect(getReadingStreak(books)).toEqual({ current: 0, longest: 0 });
  });

  it('calculates a current streak of 1 for a book finished today', () => {
    const today = new Date();
    const books = [
      makeBook({ status: 'read', finishedReading: today.toISOString() }),
    ];
    const result = getReadingStreak(books);
    expect(result.current).toBe(1);
    expect(result.longest).toBe(1);
  });

  it('calculates streak across consecutive days', () => {
    const now = new Date();
    const books = [
      makeBook({ status: 'read', finishedReading: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString() }),
      makeBook({ status: 'read', finishedReading: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString() }),
      makeBook({ status: 'read', finishedReading: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2).toISOString() }),
    ];
    const result = getReadingStreak(books);
    expect(result.current).toBe(3);
    expect(result.longest).toBe(3);
  });

  it('handles longest streak being in the past', () => {
    const books = [
      // Past streak: 4 consecutive days
      makeBook({ status: 'read', finishedReading: '2025-06-01T00:00:00.000Z' }),
      makeBook({ status: 'read', finishedReading: '2025-06-02T00:00:00.000Z' }),
      makeBook({ status: 'read', finishedReading: '2025-06-03T00:00:00.000Z' }),
      makeBook({ status: 'read', finishedReading: '2025-06-04T00:00:00.000Z' }),
    ];
    const result = getReadingStreak(books);
    expect(result.longest).toBe(4);
    expect(result.current).toBe(0);
  });

  it('deduplicates multiple books on the same day', () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const books = [
      makeBook({ status: 'read', finishedReading: today }),
      makeBook({ status: 'read', finishedReading: today }),
    ];
    const result = getReadingStreak(books);
    expect(result.current).toBe(1);
    expect(result.longest).toBe(1);
  });
});

/* ================================================================
 *  getMonthlyReadingCounts
 * ================================================================ */

describe('getMonthlyReadingCounts', () => {
  it('returns 12 months', () => {
    const result = getMonthlyReadingCounts([]);
    expect(result).toHaveLength(12);
  });

  it('all counts are 0 for empty library', () => {
    const result = getMonthlyReadingCounts([]);
    expect(result.every((m) => m.count === 0)).toBe(true);
  });

  it('counts books finished in specific months', () => {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15).toISOString();
    const books = [
      makeBook({ status: 'read', finishedReading: thisMonth }),
      makeBook({ status: 'read', finishedReading: thisMonth }),
    ];
    const result = getMonthlyReadingCounts(books);
    // Last entry should be current month
    const currentMonthEntry = result[result.length - 1];
    expect(currentMonthEntry.count).toBe(2);
  });

  it('ignores non-read books', () => {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15).toISOString();
    const books = [
      makeBook({ status: 'reading', finishedReading: thisMonth }),
    ];
    const result = getMonthlyReadingCounts(books);
    const currentMonthEntry = result[result.length - 1];
    expect(currentMonthEntry.count).toBe(0);
  });

  it('ignores read books without finishedReading date', () => {
    const books = [
      makeBook({ status: 'read' }),
    ];
    const result = getMonthlyReadingCounts(books);
    expect(result.every((m) => m.count === 0)).toBe(true);
  });
});
