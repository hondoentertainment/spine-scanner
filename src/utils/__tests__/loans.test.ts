import { describe, expect, it } from 'vitest';
import type { BookEntry } from '../../types';
import { formatLoanDue, isLoanDueSoon, isOnLoan, lendBook, returnBook } from '../loans';

const book = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'b1',
  isbn: '9780141036144',
  title: '1984',
  author: 'George Orwell',
  pageCount: 328,
  amazonLink: '',
  coverImg: '',
  status: 'reading',
  notes: '',
  dateAdded: '2026-01-15T00:00:00.000Z',
  shelfIds: [],
  ...overrides,
});

const now = new Date('2026-10-08T12:00:00.000Z');

describe('loans', () => {
  it('lends a book to a named person and clears the loan on return', () => {
    const lent = lendBook(book(), {
      borrowerName: '  Ada  ',
      dueAt: '2026-10-10',
      lentAt: '2026-10-01T00:00:00.000Z',
    });
    expect(isOnLoan(lent)).toBe(true);
    expect(lent.loan).toEqual({
      borrowerName: 'Ada',
      lentAt: '2026-10-01T00:00:00.000Z',
      dueAt: '2026-10-10',
    });
    expect(isOnLoan(returnBook(lent))).toBe(false);
    expect(returnBook(lent).loan).toBeNull();
  });

  it('flags loans due within a week and overdue loans', () => {
    const soon = lendBook(book(), { borrowerName: 'Ada', dueAt: '2026-10-12' });
    const later = lendBook(book({ id: 'later' }), { borrowerName: 'Grace', dueAt: '2026-12-01' });
    const overdue = lendBook(book({ id: 'late' }), { borrowerName: 'Lin', dueAt: '2026-10-01' });
    const open = lendBook(book({ id: 'open' }), { borrowerName: 'Sam' });

    expect(isLoanDueSoon(soon, now)).toBe(true);
    expect(isLoanDueSoon(later, now)).toBe(false);
    expect(isLoanDueSoon(overdue, now)).toBe(true);
    expect(isLoanDueSoon(open, now)).toBe(false);
    expect(formatLoanDue(overdue, now)).toMatch(/Overdue by/);
    expect(formatLoanDue(open, now)).toBe('No due date');
  });
});
