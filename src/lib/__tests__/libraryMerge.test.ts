import { describe, expect, it } from 'vitest';
import { mergePulledLibrary } from '../../../packages/shared/src/libraryMerge.ts';
import { CURRENT_SCHEMA_VERSION } from '../../../packages/shared/src/schemaMigrations.ts';
import type { BookEntry, Shelf } from '../../types';

const book = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'local-only',
  isbn: '9780141036144',
  title: 'On this device',
  author: 'Author',
  pageCount: 100,
  amazonLink: '',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: '2026-02-01T00:00:00.000Z',
  shelfIds: [],
  ...overrides,
});

const shelf = (overrides: Partial<Shelf> = {}): Shelf => ({
  id: 's1',
  name: 'Fiction',
  color: '#6366f1',
  ...overrides,
});

describe('mergePulledLibrary', () => {
  it('keeps a book that exists only on the device and a book that exists only in the cloud', () => {
    const merged = mergePulledLibrary(
      [book({ id: 'local', dateAdded: '2026-02-02T00:00:00.000Z' })],
      [book({ id: 'remote', title: 'From the cloud', dateAdded: '2026-02-03T00:00:00.000Z' })],
      [shelf({ id: 'local-shelf', name: 'Desk' })],
      [shelf({ id: 'remote-shelf', name: 'Attic' })],
    );

    expect(merged.books.map((entry) => entry.id)).toEqual(['remote', 'local']);
    expect(merged.books.every((entry) => entry.schemaVersion === CURRENT_SCHEMA_VERSION)).toBe(true);
    expect(merged.shelves.map((entry) => entry.id).sort()).toEqual(['local-shelf', 'remote-shelf']);
  });

  it('keeps the device copy when the same book id is in both libraries', () => {
    const merged = mergePulledLibrary(
      [book({ id: 'same', title: 'Device title', locationRoom: 'Study' })],
      [book({ id: 'same', title: 'Cloud title', locationRoom: 'Hall' })],
      [shelf({ id: 'same', name: 'Device shelf' })],
      [shelf({ id: 'same', name: 'Cloud shelf' })],
    );

    expect(merged.books).toHaveLength(1);
    expect(merged.books[0].title).toBe('Device title');
    expect(merged.books[0].locationRoom).toBe('Study');
    expect(merged.shelves).toEqual([shelf({ id: 'same', name: 'Device shelf' })]);
  });
});