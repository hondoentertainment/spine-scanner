import type { BookEntry } from '../types.ts';

export interface BatchExportResult {
  succeeded: BookEntry[];
  failed: { book: BookEntry; error: string }[];
}

/**
 * Exports books in batches, tracking which succeed and which fail.
 * Enables "Retry Failed Only" after partial failures (e.g. network drops).
 *
 * @param books - The list of books to export
 * @param exportFn - An async function that exports a single book (e.g. API call)
 * @param batchSize - How many to process concurrently (default 5)
 */
export async function batchExportBooks(
  books: BookEntry[],
  exportFn: (book: BookEntry) => Promise<void>,
  batchSize = 5,
): Promise<BatchExportResult> {
  const succeeded: BookEntry[] = [];
  const failed: { book: BookEntry; error: string }[] = [];

  // Process in batches
  for (let i = 0; i < books.length; i += batchSize) {
    const batch = books.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (book) => {
        await exportFn(book);
        return book;
      }),
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === 'fulfilled') {
        succeeded.push(result.value);
      } else {
        failed.push({
          book: batch[j],
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }
  }

  return { succeeded, failed };
}

/**
 * Retry only the books that failed in a previous batch export.
 *
 * @param previousResult - The result from a previous batchExportBooks call
 * @param exportFn - The export function to retry with
 * @param batchSize - Batch size for retry
 */
export async function retryFailedExports(
  previousResult: BatchExportResult,
  exportFn: (book: BookEntry) => Promise<void>,
  batchSize = 5,
): Promise<BatchExportResult> {
  const booksToRetry = previousResult.failed.map(f => f.book);

  if (booksToRetry.length === 0) {
    return { succeeded: [], failed: [] };
  }

  const retryResult = await batchExportBooks(booksToRetry, exportFn, batchSize);

  return {
    // Combine previously succeeded with newly succeeded
    succeeded: [...previousResult.succeeded, ...retryResult.succeeded],
    failed: retryResult.failed,
  };
}
