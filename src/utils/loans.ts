import type { BookEntry, BookLoan } from '../types.ts';

const DAY_MS = 86_400_000;

export function isOnLoan(book: BookEntry): boolean {
  return Boolean(book.loan?.borrowerName?.trim());
}

export function loanDueDate(book: BookEntry): Date | null {
  const due = book.loan?.dueAt;
  if (!due) return null;
  const parsed = new Date(due);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Overdue, or due within `withinDays` (default 7). Books without a due date are not due soon. */
export function isLoanDueSoon(book: BookEntry, now = new Date(), withinDays = 7): boolean {
  if (!isOnLoan(book)) return false;
  const due = loanDueDate(book);
  if (!due) return false;
  const horizon = now.getTime() + withinDays * DAY_MS;
  return due.getTime() <= horizon;
}

export function isLoanOverdue(book: BookEntry, now = new Date()): boolean {
  if (!isOnLoan(book)) return false;
  const due = loanDueDate(book);
  if (!due) return false;
  return due.getTime() < now.getTime();
}

export function lendBook(
  book: BookEntry,
  input: { borrowerName: string; dueAt?: string | null; lentAt?: string },
): BookEntry {
  const borrowerName = input.borrowerName.trim();
  const loan: BookLoan = {
    borrowerName,
    lentAt: input.lentAt ?? new Date().toISOString(),
    dueAt: input.dueAt?.trim() ? input.dueAt : null,
  };
  return { ...book, loan };
}

export function returnBook(book: BookEntry): BookEntry {
  return { ...book, loan: null };
}

export function formatLoanDue(book: BookEntry, now = new Date()): string {
  const due = loanDueDate(book);
  if (!due) return 'No due date';
  if (isLoanOverdue(book, now)) {
    const days = Math.max(1, Math.ceil((now.getTime() - due.getTime()) / DAY_MS));
    return `Overdue by ${days} day${days === 1 ? '' : 's'}`;
  }
  const days = Math.ceil((due.getTime() - now.getTime()) / DAY_MS);
  if (days <= 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}
