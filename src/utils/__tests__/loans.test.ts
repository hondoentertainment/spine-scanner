import { describe, expect, it, vi } from 'vitest';
import type { BookEntry } from '../../types';
import { formatLocaleDate, localDateKey } from '../formatDate';
import { formatLentSince, formatLoanDue, isLoanDueSoon, isOnLoan, lendBook, loanBadgeText, mergeLoanLedgers, returnBook } from '../loans';

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
    const returned = returnBook(lent, '2026-10-11T00:00:00.000Z');
    expect(isOnLoan(returned)).toBe(false);
    expect(returned.loan).toBeNull();
    expect(returned.lentTo).toBe('Ada');
    expect(returned.returnedAt).toBe('2026-10-11T00:00:00.000Z');
    expect(returned.loanLedger).toEqual([
      {
        lentTo: 'Ada',
        lentAt: '2026-10-01T00:00:00.000Z',
        dueAt: '2026-10-10',
        returnedAt: '2026-10-11T00:00:00.000Z',
      },
    ]);
    expect(returned.title).toBe('1984');
  });

  it('keeps earlier returns when the same copy is lent again', () => {
    const once = returnBook(
      lendBook(book(), { borrowerName: 'Ada', lentAt: '2026-10-01T00:00:00.000Z' }),
      '2026-10-05T00:00:00.000Z',
    );
    const twice = lendBook(once, { lentTo: 'Grace', lentAt: '2026-10-06T00:00:00.000Z', dueAt: '' });
    expect(isOnLoan(twice)).toBe(true);
    expect(twice.lentTo).toBe('Grace');
    expect(twice.returnedAt).toBe('');
    expect(twice.loanLedger).toHaveLength(2);
    expect(twice.loanLedger?.[0].returnedAt).toBe('2026-10-05T00:00:00.000Z');
    expect(formatLentSince(twice)).toBe(`Lent to Grace since ${formatLocaleDate('2026-10-06T00:00:00.000Z')}`);
  });

  it('labels overdue copies and ignores returned ones', () => {
    const overdue = lendBook(book(), { borrowerName: 'Lin', dueAt: '2026-10-01', lentAt: '2026-09-01T00:00:00.000Z' });
    expect(loanBadgeText(overdue, now)).toBe('Overdue');
    expect(formatLentSince(overdue)).toBe(`Lent to Lin since ${formatLocaleDate('2026-09-01T00:00:00.000Z')}`);
    expect(loanBadgeText(returnBook(overdue, '2026-10-09T00:00:00.000Z'), now)).toBeNull();
    expect(loanBadgeText(lendBook(book({ id: 'open' }), { borrowerName: 'Sam' }), now)).toBe('Lent out');
  });

  it('does not replace the person who already has the book', () => {
    const lent = lendBook(book({ notes: 'keep' }), { borrowerName: 'Ada', lentAt: '2026-10-01T00:00:00.000Z' });
    const again = lendBook(lent, { borrowerName: 'Grace', lentAt: '2026-10-02T00:00:00.000Z' });
    expect(again.lentTo).toBe('Ada');
    expect(again.notes).toBe('keep');
    expect(again.loanLedger).toHaveLength(1);
  });

  it('keeps the first open loan when two copies of the same book are both out', () => {
    const primary = lendBook(book({ id: 'keep', notes: 'shelf' }), {
      borrowerName: 'Ada',
      lentAt: '2026-10-01T00:00:00.000Z',
    });
    const secondary = lendBook(book({ id: 'drop' }), {
      borrowerName: 'Grace',
      lentAt: '2026-09-01T00:00:00.000Z',
    });
    const merged = mergeLoanLedgers(primary, secondary);
    expect(merged.lentTo).toBe('Ada');
    expect(merged.loan?.borrowerName).toBe('Ada');
    expect(merged.loanLedger?.some((entry) => entry.lentTo === 'Grace' && entry.returnedAt)).toBe(true);
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

  it('stores the local calendar day when a loan starts or comes back', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 20, 22, 30, 0));
    const lent = lendBook(book(), { lentTo: 'Ada' });
    expect(lent.lentAt).toBe('2026-10-20');
    expect(lent.lentAt).toBe(localDateKey());
    expect(formatLentSince(lent)).toBe(`Lent to Ada since ${formatLocaleDate('2026-10-20')}`);
    const returned = returnBook(lent);
    expect(returned.returnedAt).toBe('2026-10-20');
    vi.useRealTimers();
  });
});
