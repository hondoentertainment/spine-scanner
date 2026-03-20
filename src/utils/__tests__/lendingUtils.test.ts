import { describe, it, expect } from 'vitest';
import {
  isBookLent,
  getActiveLoan,
  isOverdue,
  getDaysUntilDue,
  getLendingSummary,
} from '../lendingUtils';
import type { LendingRecord } from '../../types';

function makeRecord(overrides: Partial<LendingRecord> = {}): LendingRecord {
  return {
    id: 'loan-1',
    bookId: 'book-1',
    borrowerName: 'Alice',
    lentDate: new Date().toISOString(),
    ...overrides,
  };
}

describe('isBookLent', () => {
  it('returns true when book has an active (unreturned) loan', () => {
    const records = [makeRecord({ bookId: 'book-1' })];
    expect(isBookLent('book-1', records)).toBe(true);
  });

  it('returns false when all loans are returned', () => {
    const records = [makeRecord({ bookId: 'book-1', returnedDate: new Date().toISOString() })];
    expect(isBookLent('book-1', records)).toBe(false);
  });

  it('returns false for a different bookId', () => {
    const records = [makeRecord({ bookId: 'book-2' })];
    expect(isBookLent('book-1', records)).toBe(false);
  });

  it('returns false for empty records', () => {
    expect(isBookLent('book-1', [])).toBe(false);
  });
});

describe('getActiveLoan', () => {
  it('returns the active loan for the book', () => {
    const record = makeRecord({ bookId: 'book-1' });
    expect(getActiveLoan('book-1', [record])).toEqual(record);
  });

  it('returns null when no active loan exists', () => {
    const record = makeRecord({ bookId: 'book-1', returnedDate: new Date().toISOString() });
    expect(getActiveLoan('book-1', [record])).toBeNull();
  });

  it('returns null for wrong bookId', () => {
    const record = makeRecord({ bookId: 'book-2' });
    expect(getActiveLoan('book-1', [record])).toBeNull();
  });
});

describe('isOverdue', () => {
  it('returns true when past due date and not returned', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const record = makeRecord({ dueDate: yesterday });
    expect(isOverdue(record)).toBe(true);
  });

  it('returns false when due date is in the future', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const record = makeRecord({ dueDate: tomorrow });
    expect(isOverdue(record)).toBe(false);
  });

  it('returns false when no due date is set', () => {
    const record = makeRecord();
    expect(isOverdue(record)).toBe(false);
  });

  it('returns false when book is already returned even if overdue', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const record = makeRecord({ dueDate: yesterday, returnedDate: new Date().toISOString() });
    expect(isOverdue(record)).toBe(false);
  });
});

describe('getDaysUntilDue', () => {
  it('returns null when no due date', () => {
    const record = makeRecord();
    expect(getDaysUntilDue(record)).toBeNull();
  });

  it('returns positive number for future due date', () => {
    const future = new Date(Date.now() + 3 * 86400000).toISOString();
    const record = makeRecord({ dueDate: future });
    const days = getDaysUntilDue(record);
    expect(days).not.toBeNull();
    expect(days!).toBeGreaterThanOrEqual(2);
    expect(days!).toBeLessThanOrEqual(4);
  });

  it('returns negative number for past due date', () => {
    const past = new Date(Date.now() - 3 * 86400000).toISOString();
    const record = makeRecord({ dueDate: past });
    const days = getDaysUntilDue(record);
    expect(days).not.toBeNull();
    expect(days!).toBeLessThanOrEqual(-2);
    expect(days!).toBeGreaterThanOrEqual(-4);
  });
});

describe('getLendingSummary', () => {
  it('returns correct summary for mixed records', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const records: LendingRecord[] = [
      makeRecord({ id: '1' }), // active, not overdue (no due date)
      makeRecord({ id: '2', dueDate: yesterday }), // active, overdue
      makeRecord({ id: '3', returnedDate: new Date().toISOString() }), // returned
    ];

    const summary = getLendingSummary(records);
    expect(summary.activeLoans).toBe(2);
    expect(summary.totalLent).toBe(3);
    expect(summary.overdueCount).toBe(1);
  });

  it('returns zeros for empty records', () => {
    const summary = getLendingSummary([]);
    expect(summary.activeLoans).toBe(0);
    expect(summary.totalLent).toBe(0);
    expect(summary.overdueCount).toBe(0);
  });
});
