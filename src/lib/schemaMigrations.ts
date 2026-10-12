import type { BookEntry } from '../types.ts';
import { normalizePhysicalLocation } from '../utils/physicalLocation.ts';

export const CURRENT_SCHEMA_VERSION = 3;

type Migration = (book: BookEntry) => BookEntry;

/** Map of fromVersion → migration that produces the next-version shape. */
const MIGRATIONS: Record<number, Migration> = {
  // Loan tracking lives on the book. Older rows simply have no loan.
  1: (book) => ({ ...book, schemaVersion: 2 }),
  // Physical shelf map. Missing fields become empty strings; existing values stay.
  2: (book) => ({
    ...book,
    ...normalizePhysicalLocation(book),
    schemaVersion: 3,
  }),
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
      // Unknown version — stamp current to avoid infinite loop, log a breadcrumb.
      // Still fill location fields so a jump from v0 does not drop the new shape.
      result = { ...result, ...normalizePhysicalLocation(result), schemaVersion: CURRENT_SCHEMA_VERSION };
      break;
    }
    result = migration(result);
    current = result.schemaVersion ?? current + 1;
  }
  // Always stamp the current version on the result
  if ((result.schemaVersion ?? 0) < CURRENT_SCHEMA_VERSION) {
    result = { ...result, ...normalizePhysicalLocation(result), schemaVersion: CURRENT_SCHEMA_VERSION };
  }
  return result;
}

export function migrateBooks(books: BookEntry[]): BookEntry[] {
  return books.map(migrateBook);
}
