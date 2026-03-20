import type { LendingRecord } from '../types';

/** Check whether a book currently has an active (unreturned) loan. */
export function isBookLent(bookId: string, records: LendingRecord[]): boolean {
  return records.some((r) => r.bookId === bookId && !r.returnedDate);
}

/** Get the active loan for a book, or null if not lent out. */
export function getActiveLoan(bookId: string, records: LendingRecord[]): LendingRecord | null {
  return records.find((r) => r.bookId === bookId && !r.returnedDate) ?? null;
}

/** Check whether a lending record is overdue. */
export function isOverdue(record: LendingRecord): boolean {
  if (record.returnedDate || !record.dueDate) return false;
  return new Date(record.dueDate) < new Date();
}

/** Get the number of days until a loan is due (negative if overdue). Returns null if no due date. */
export function getDaysUntilDue(record: LendingRecord): number | null {
  if (!record.dueDate) return null;
  const now = new Date();
  const due = new Date(record.dueDate);
  const diffMs = due.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/** Get a summary of lending activity. */
export function getLendingSummary(records: LendingRecord[]): {
  activeLoans: number;
  totalLent: number;
  overdueCount: number;
} {
  const activeLoans = records.filter((r) => !r.returnedDate).length;
  const overdueCount = records.filter((r) => isOverdue(r)).length;
  return {
    activeLoans,
    totalLent: records.length,
    overdueCount,
  };
}
