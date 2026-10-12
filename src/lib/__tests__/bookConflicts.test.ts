import { describe, expect, it } from 'vitest';
import type { BookEntry } from '../../types';
import { booksConflict, findBookConflicts } from '../bookConflicts';

const book = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'b1',
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

describe('findBookConflicts', () => {
  it('ignores books that match and books that exist on only one side', () => {
    const local = [book(), book({ id: 'local-only', title: 'Local' })];
    const remote = [book(), book({ id: 'remote-only', title: 'Remote' })];
    expect(findBookConflicts(local, remote)).toEqual([]);
  });

  it('keeps both copies when title, notes, or loan differ', () => {
    const local = book({ notes: 'mine', loan: { borrowerName: 'Ada', lentAt: '2026-01-01T00:00:00.000Z', dueAt: null } });
    const remote = book({ notes: 'theirs', loan: { borrowerName: 'Grace', lentAt: '2026-01-02T00:00:00.000Z', dueAt: null } });
    expect(booksConflict(local, remote)).toBe(true);
    const [conflict] = findBookConflicts([local], [remote]);
    expect(conflict.bookId).toBe('b1');
    expect(conflict.local.notes).toBe('mine');
    expect(conflict.remote.loan?.borrowerName).toBe('Grace');
  });
});
