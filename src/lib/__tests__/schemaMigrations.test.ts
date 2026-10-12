import { describe, it, expect } from 'vitest';
import type { BookEntry } from '../../types';
import { CURRENT_SCHEMA_VERSION, migrateBook, migrateBooks } from '../schemaMigrations';

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'b1',
  isbn: '9780141036144',
  title: 'Test Book',
  author: 'Test Author',
  pageCount: 200,
  amazonLink: 'https://amazon.com',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: '2026-01-15T00:00:00.000Z',
  shelfIds: [],
  ...overrides,
});

describe('migrateBook', () => {
  it('stamps schemaVersion on a book missing it', () => {
    const book = makeBook();
    expect(book.schemaVersion).toBeUndefined();
    const migrated = migrateBook(book);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('is idempotent on a book already at current version', () => {
    const book = makeBook({ schemaVersion: CURRENT_SCHEMA_VERSION });
    const migrated = migrateBook(book);
    expect(migrated).toBe(book);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('leaves a book at a higher schemaVersion unchanged', () => {
    const book = makeBook({ schemaVersion: CURRENT_SCHEMA_VERSION + 5 });
    const migrated = migrateBook(book);
    expect(migrated).toBe(book);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION + 5);
  });

  it('preserves all other fields when stamping schemaVersion', () => {
    const book = makeBook({ title: 'Dune', author: 'Frank Herbert', pageCount: 688 });
    const migrated = migrateBook(book);
    expect(migrated.title).toBe('Dune');
    expect(migrated.author).toBe('Frank Herbert');
    expect(migrated.pageCount).toBe(688);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
});

describe('migrateBooks', () => {
  it('handles an empty array', () => {
    expect(migrateBooks([])).toEqual([]);
  });

  it('migrates mixed-version books', () => {
    const books: BookEntry[] = [
      makeBook({ id: 'a' }),
      makeBook({ id: 'b', schemaVersion: CURRENT_SCHEMA_VERSION }),
      makeBook({ id: 'c', schemaVersion: CURRENT_SCHEMA_VERSION + 2 }),
    ];
    const migrated = migrateBooks(books);
    expect(migrated).toHaveLength(3);
    expect(migrated[0].schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated[1].schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated[2].schemaVersion).toBe(CURRENT_SCHEMA_VERSION + 2);
  });

  it('does not mutate the input array entries that need migration', () => {
    const original = makeBook();
    const migrated = migrateBooks([original]);
    expect(original.schemaVersion).toBeUndefined();
    expect(migrated[0].schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated[0]).not.toBe(original);
  });
});

describe('migration chain (simulated)', () => {
  // Verifies the runner pattern: a chain of migrations applied in order.
  // Version 0 has no registered step, so the runner stamps the current version.
  it('stamps current version when no migration is registered for an old version', () => {
    const book = makeBook({ schemaVersion: 0, title: 'Keep me' });
    const migrated = migrateBook(book);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.title).toBe('Keep me');
    expect(migrated.locationRoom).toBe('');
    expect(migrated.locationCase).toBe('');
    expect(migrated.locationShelf).toBe('');
  });

  it('migrates a v1 book through loans and physical location without dropping fields', () => {
    const book = makeBook({
      schemaVersion: 1,
      title: 'Dune',
      notes: 'desert',
      loan: { borrowerName: 'Ada', lentAt: '2026-10-01T00:00:00.000Z', dueAt: null },
    });
    const migrated = migrateBook(book);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.title).toBe('Dune');
    expect(migrated.notes).toBe('desert');
    expect(migrated.loan?.borrowerName).toBe('Ada');
    expect(migrated.lentTo).toBe('Ada');
    expect(migrated.lentAt).toBe('2026-10-01T00:00:00.000Z');
    expect(migrated.dueAt).toBe('');
    expect(migrated.returnedAt).toBe('');
    expect(migrated.loanLedger).toEqual([
      { lentTo: 'Ada', lentAt: '2026-10-01T00:00:00.000Z', dueAt: '', returnedAt: '' },
    ]);
    expect(migrated.locationRoom).toBe('');
    expect(migrated.locationCase).toBe('');
    expect(migrated.locationShelf).toBe('');
  });

  it('keeps an existing physical location when moving a v2 book forward', () => {
    const book = makeBook({
      schemaVersion: 2,
      locationRoom: ' Study ',
      locationCase: 'Oak',
      notes: 'keep',
    });
    const migrated = migrateBook(book);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.notes).toBe('keep');
    expect(migrated.locationRoom).toBe('Study');
    expect(migrated.locationCase).toBe('Oak');
    expect(migrated.locationShelf).toBe('');
    expect(migrated.lentTo).toBe('');
    expect(migrated.loanLedger).toEqual([]);
    expect(migrated.loan ?? null).toBeNull();
    expect(migrated).not.toBe(book);
  });

  it('adds an empty lending ledger without dropping an existing library book', () => {
    const book = makeBook({
      schemaVersion: 3,
      title: 'Keep',
      notes: 'mine',
      locationRoom: 'Study',
    });
    const migrated = migrateBook(book);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.title).toBe('Keep');
    expect(migrated.notes).toBe('mine');
    expect(migrated.locationRoom).toBe('Study');
    expect(migrated.lentTo).toBe('');
    expect(migrated.lentAt).toBe('');
    expect(migrated.dueAt).toBe('');
    expect(migrated.returnedAt).toBe('');
    expect(migrated.loanLedger).toEqual([]);
  });

  it('runs migrations in order via a local simulated runner', () => {
    // This test demonstrates the expected ordering behavior without
    // adding real migrations to the production file.
    type LocalMigration = (b: BookEntry) => BookEntry;
    const localMigrations: Record<number, LocalMigration> = {
      0: (b) => ({ ...b, notes: `${b.notes}|m0`, schemaVersion: 1 }),
      1: (b) => ({ ...b, notes: `${b.notes}|m1`, schemaVersion: 2 }),
      2: (b) => ({ ...b, notes: `${b.notes}|m2`, schemaVersion: 3 }),
    };
    const target = 3;
    function runLocal(book: BookEntry): BookEntry {
      let current = book.schemaVersion ?? 0;
      let result = book;
      while (current < target) {
        const migration = localMigrations[current];
        if (!migration) {
          result = { ...result, schemaVersion: target };
          break;
        }
        result = migration(result);
        current = result.schemaVersion ?? current + 1;
      }
      return result;
    }

    const start = makeBook({ notes: 'start', schemaVersion: 0 });
    const out = runLocal(start);
    expect(out.schemaVersion).toBe(3);
    expect(out.notes).toBe('start|m0|m1|m2');
  });
});
