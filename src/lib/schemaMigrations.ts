import type { BookEntry } from '../types.ts';

export const CURRENT_SCHEMA_VERSION = 1;

type Migration = (book: BookEntry) => BookEntry;

/** Map of fromVersion → migration that produces the next-version shape. */
const MIGRATIONS: Record<number, Migration> = {
  // Future example:
  // 1: (b) => ({ ...b, newField: defaultValue, schemaVersion: 2 }),
};

/**
 * Runs all pending migrations on a single book.
 * Idempotent: if book is already at CURRENT_SCHEMA_VERSION (or higher), returns as-is.
 */
export function migrateBook(book: BookEntry): BookEntry {
  let current = book.schemaVersion ?? 0;
  let result = book;
  while (current < CURRENT_SCHEMA_VERSION) {
    const migration = MIGRATIONS[current];
    if (!migration) {
      // Unknown version — stamp current to avoid infinite loop, log a breadcrumb
      result = { ...result, schemaVersion: CURRENT_SCHEMA_VERSION };
      break;
    }
    result = migration(result);
    current = result.schemaVersion ?? current + 1;
  }
  // Always stamp the current version on the result
  if ((result.schemaVersion ?? 0) < CURRENT_SCHEMA_VERSION) {
    result = { ...result, schemaVersion: CURRENT_SCHEMA_VERSION };
  }
  return result;
}

export function migrateBooks(books: BookEntry[]): BookEntry[] {
  return books.map(migrateBook);
}
