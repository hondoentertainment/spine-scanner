import { describe, expect, it } from 'vitest';
import { createPhotoOnlyBook, PHOTO_ONLY_REVIEW_REASON } from '../../../packages/shared/src/bookState.ts';
import { toBookRow } from '../../../packages/shared/src/booksApi.ts';
import { mergeBookCopies, mergePulledLibrary } from '../../../packages/shared/src/libraryMerge.ts';
import { lendBook } from '../../../packages/shared/src/loans.ts';
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

  it('keeps photo, review, loan, and location fields on refresh and upload', () => {
    const placed = {
      ...lendBook(createPhotoOnlyBook({
        id: 'desk',
        title: 'Desk copy',
        coverImg: 'data:image/jpeg;base64,abc',
        dateAdded: '2026-10-01T00:00:00.000Z',
      }), { lentTo: 'Ada', dueAt: '2026-11-01', lentAt: '2026-10-02' }),
      locationRoom: 'Study',
      locationCase: 'Oak',
      locationShelf: '2',
    };
    const fromCloud = mergePulledLibrary([], [placed], [], []);
    const fromDevice = mergePulledLibrary([placed], [], [], []);

    for (const merged of [fromCloud, fromDevice]) {
      const kept = merged.books[0];
      expect(kept.isPhotoOnly).toBe(true);
      expect(kept.needsReview).toBe(true);
      expect(kept.reviewReason).toBe(PHOTO_ONLY_REVIEW_REASON);
      expect(kept.loan?.borrowerName).toBe('Ada');
      expect(kept.loanLedger?.[0]).toMatchObject({ lentTo: 'Ada', dueAt: '2026-11-01', returnedAt: '' });
      expect(kept.locationRoom).toBe('Study');
      expect(kept.locationCase).toBe('Oak');
      expect(kept.locationShelf).toBe('2');

      const row = toBookRow(kept, 'user-1');
      expect(row.is_photo_only).toBe(true);
      expect(row.needs_review).toBe(true);
      expect(row.review_reason).toBe(PHOTO_ONLY_REVIEW_REASON);
      expect(row.loan?.borrowerName).toBe('Ada');
      expect(row.loan_ledger).toEqual(kept.loanLedger);
      expect(row.location_room).toBe('Study');
      expect(row.location_case).toBe('Oak');
      expect(row.location_shelf).toBe('2');
    }
  });

  it('keeps cloud photo, loan, and location fields the device copy never stored', () => {
    const remote = book({
      id: 'same',
      title: 'Cloud title',
      isPhotoOnly: true,
      needsReview: true,
      reviewReason: PHOTO_ONLY_REVIEW_REASON,
      loan: { borrowerName: 'Ada', lentAt: '2026-10-01', dueAt: '2026-11-01' },
      loanLedger: [{ lentTo: 'Ada', lentAt: '2026-10-01', dueAt: '2026-11-01', returnedAt: '' }],
      locationRoom: 'Study',
      locationCase: 'Oak',
      locationShelf: '2',
    });
    const merged = mergeBookCopies(book({ id: 'same', title: 'Device title' }), remote);

    expect(merged.title).toBe('Device title');
    expect(merged.isPhotoOnly).toBe(true);
    expect(merged.needsReview).toBe(true);
    expect(merged.loan?.borrowerName).toBe('Ada');
    expect(merged.loanLedger).toEqual(remote.loanLedger);
    expect(merged.locationRoom).toBe('Study');
    expect(merged.locationCase).toBe('Oak');
    expect(merged.locationShelf).toBe('2');
  });

  it('keeps an explicit device loan and location when the cloud copy differs', () => {
    const local = book({
      id: 'same',
      isPhotoOnly: false,
      needsReview: false,
      loan: null,
      loanLedger: [],
      locationRoom: '',
      locationCase: 'Pine',
      locationShelf: '',
    });
    const remote = book({
      id: 'same',
      isPhotoOnly: true,
      needsReview: true,
      loan: { borrowerName: 'Ada', lentAt: '2026-10-01', dueAt: null },
      loanLedger: [{ lentTo: 'Ada', lentAt: '2026-10-01', dueAt: '', returnedAt: '' }],
      locationRoom: 'Hall',
      locationCase: 'Oak',
      locationShelf: '2',
    });
    const merged = mergePulledLibrary([local], [remote], [], []);
    expect(merged.books[0].isPhotoOnly).toBe(false);
    expect(merged.books[0].needsReview).toBe(false);
    expect(merged.books[0].loan ?? null).toBeNull();
    expect(merged.books[0].loanLedger).toEqual([]);
    expect(merged.books[0].locationRoom).toBe('');
    expect(merged.books[0].locationCase).toBe('Pine');
    expect(merged.books[0].locationShelf).toBe('');
  });
});