import { describe, it, expect, vi } from 'vitest';
import { batchExportBooks, retryFailedExports } from '../batchExport';
import type { BatchExportResult } from '../batchExport';
import type { BookEntry } from '../../types';

/**
 * ─── 3b. Batch Export Recovery ───────────────────────────────────
 *
 * Test: Attempt to export 20 books at once and simulate a network
 * drop at book #10.
 *
 * Success: The app identifies which books failed and allows a
 * "Retry Failed Only" action. Previously succeeded books are not
 * re-exported.
 */

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'batch-1',
  isbn: '9780141036144',
  title: 'Test Book',
  author: 'Test Author',
  pageCount: 200,
  amazonLink: 'https://amazon.com',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: new Date().toISOString(),
  shelfIds: [],
  ...overrides,
});

const createLibrary = (count: number): BookEntry[] =>
  Array.from({ length: count }, (_, i) =>
    makeBook({
      id: `book-${i + 1}`,
      isbn: `978000000${String(i + 1).padStart(4, '0')}`,
      title: `Book ${i + 1}`,
      author: `Author ${i + 1}`,
    })
  );

describe('Batch Export Recovery', () => {
  it('exports all books successfully when there are no errors', async () => {
    const books = createLibrary(20);
    const exportFn = vi.fn().mockResolvedValue(undefined);

    const result = await batchExportBooks(books, exportFn);

    expect(result.succeeded).toHaveLength(20);
    expect(result.failed).toHaveLength(0);
    expect(exportFn).toHaveBeenCalledTimes(20);
  });

  it('identifies which books failed when network drops at book #10', async () => {
    const books = createLibrary(20);
    let callCount = 0;

    const exportFn = vi.fn(async () => {
      callCount++;
      if (callCount > 10) {
        throw new Error('Network error: connection reset');
      }
    });

    const result = await batchExportBooks(books, exportFn, 5);

    // First 10 should succeed, rest should fail
    expect(result.succeeded).toHaveLength(10);
    expect(result.failed).toHaveLength(10);

    // Verify the failed books are identified correctly
    const failedIds = result.failed.map(f => f.book.id);
    for (let i = 11; i <= 20; i++) {
      expect(failedIds).toContain(`book-${i}`);
    }

    // Verify error messages are captured
    expect(result.failed[0].error).toContain('Network error');
  });

  it('allows "Retry Failed Only" after a partial failure', async () => {
    const books = createLibrary(20);
    let callCount = 0;

    // First attempt: fails after book #10
    const failingExportFn = vi.fn(async () => {
      callCount++;
      if (callCount > 10) {
        throw new Error('Network error');
      }
    });

    const firstResult = await batchExportBooks(books, failingExportFn, 5);
    expect(firstResult.succeeded).toHaveLength(10);
    expect(firstResult.failed).toHaveLength(10);

    // Retry: this time all succeed
    const successfulExportFn = vi.fn().mockResolvedValue(undefined);
    const retryResult = await retryFailedExports(firstResult, successfulExportFn, 5);

    // Should have retried only the 10 that failed
    expect(successfulExportFn).toHaveBeenCalledTimes(10);

    // Combined result should show all 20 succeeded
    expect(retryResult.succeeded).toHaveLength(20);
    expect(retryResult.failed).toHaveLength(0);
  });

  it('does not re-export already succeeded books on retry', async () => {
    const books = createLibrary(20);
    let callCount = 0;

    const failingExportFn = vi.fn(async () => {
      callCount++;
      if (callCount > 10) throw new Error('Network error');
    });

    const firstResult = await batchExportBooks(books, failingExportFn, 5);

    // Track which books are retried
    const retriedBooks: string[] = [];
    const retryExportFn = vi.fn(async (book: BookEntry) => {
      retriedBooks.push(book.id);
    });

    await retryFailedExports(firstResult, retryExportFn);

    // Only the failed books should have been retried
    const succeededIds = firstResult.succeeded.map(b => b.id);
    for (const retriedId of retriedBooks) {
      expect(succeededIds).not.toContain(retriedId);
    }
  });

  it('handles multiple retry rounds with shrinking failure sets', async () => {
    const books = createLibrary(20);

    // Round 1: books 11-20 fail
    let round1Count = 0;
    const round1Fn = vi.fn(async () => {
      round1Count++;
      if (round1Count > 10) throw new Error('Network error');
    });

    const round1 = await batchExportBooks(books, round1Fn, 5);
    expect(round1.failed).toHaveLength(10);

    // Round 2: books 16-20 still fail
    let round2Count = 0;
    const round2Fn = vi.fn(async () => {
      round2Count++;
      if (round2Count > 5) throw new Error('Still failing');
    });

    const round2 = await retryFailedExports(round1, round2Fn, 5);
    expect(round2.succeeded).toHaveLength(15); // 10 + 5 new
    expect(round2.failed).toHaveLength(5);

    // Round 3: everything succeeds
    const round3Fn = vi.fn().mockResolvedValue(undefined);
    const round3 = await retryFailedExports(round2, round3Fn, 5);
    expect(round3.succeeded).toHaveLength(20);
    expect(round3.failed).toHaveLength(0);
  });

  it('retryFailedExports is a no-op when nothing failed', async () => {
    const nothingFailed: BatchExportResult = {
      succeeded: createLibrary(10),
      failed: [],
    };

    const exportFn = vi.fn().mockResolvedValue(undefined);
    const result = await retryFailedExports(nothingFailed, exportFn);

    expect(exportFn).not.toHaveBeenCalled();
    expect(result.succeeded).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });

  it('captures distinct error messages per failed book', async () => {
    const books = createLibrary(5);
    let callCount = 0;

    const exportFn = vi.fn(async () => {
      callCount++;
      if (callCount === 2) throw new Error('Rate limited');
      if (callCount === 4) throw new Error('Server timeout');
    });

    const result = await batchExportBooks(books, exportFn, 5);

    expect(result.succeeded).toHaveLength(3);
    expect(result.failed).toHaveLength(2);

    const errors = result.failed.map(f => f.error);
    expect(errors).toContain('Rate limited');
    expect(errors).toContain('Server timeout');
  });

  it('handles large batch (50+ books) with API rate limit simulation', async () => {
    const books = createLibrary(55);
    let callCount = 0;

    // Simulate Goodreads-style rate limiting: fail every 20th request
    const exportFn = vi.fn(async () => {
      callCount++;
      if (callCount % 20 === 0) {
        throw new Error('429 Too Many Requests');
      }
    });

    const result = await batchExportBooks(books, exportFn, 10);

    // Most should succeed, a few should fail
    expect(result.succeeded.length).toBeGreaterThan(50);
    expect(result.failed.length).toBeLessThanOrEqual(5);

    // All failures should be rate-limit errors
    for (const f of result.failed) {
      expect(f.error).toContain('429');
    }
  });
});
