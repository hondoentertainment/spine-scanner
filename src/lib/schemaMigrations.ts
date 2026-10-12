import type { BookEntry } from '../types.ts';
import { lendingFields } from '../utils/loans.ts';
import { normalizePhysicalLocation } from '../utils/physicalLocation.ts';

export const CURRENT_SCHEMA_VERSION = 4;

function stampCurrent(book: BookEntry): BookEntry {
  return {
    ...book,
    ...normalizePhysicalLocation(book),
    ...lendingFields(book),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

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
  // Lending ledger. Missing fields become empty strings; an existing loan is kept.
  3: (book) => ({
    ...book,
    ...lendingFields(book),
    schemaVersion: 4,
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
      // Still fill location and lending fields so a jump from v0 does not drop the new shape.
      result = stampCurrent(result);
      break;
    }
    result = migration(result);
    current = result.schemaVersion ?? current + 1;
  }
  // Always stamp the current version on the result
  if ((result.schemaVersion ?? 0) < CURRENT_SCHEMA_VERSION) {
    result = stampCurrent(result);
  }
  return result;
}

export function migrateBooks(books: BookEntry[]): BookEntry[] {
  return books.map(migrateBook);
}
