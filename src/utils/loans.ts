import type { BookEntry, BookLoan, LoanLedgerEntry } from '../types.ts';

const DAY_MS = 86_400_000;

const EMPTY_LENDING = {
  lentTo: '',
  lentAt: '',
  dueAt: '',
  returnedAt: '',
  loanLedger: [] as LoanLedgerEntry[],
  loan: null as BookLoan | null,
};

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanLedgerEntry(raw: unknown): LoanLedgerEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Partial<LoanLedgerEntry>;
  const lentTo = cleanText(entry.lentTo);
  if (!lentTo) return null;
  return {
    lentTo,
    lentAt: cleanText(entry.lentAt),
    dueAt: cleanText(entry.dueAt),
    returnedAt: cleanText(entry.returnedAt),
  };
}

function ledgerKey(entry: LoanLedgerEntry): string {
  return `${entry.lentTo}|${entry.lentAt}|${entry.dueAt}|${entry.returnedAt}`;
}

function dedupeLedger(entries: LoanLedgerEntry[]): LoanLedgerEntry[] {
  const seen = new Set<string>();
  const next: LoanLedgerEntry[] = [];
  for (const entry of entries) {
    const key = ledgerKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(entry);
  }
  return next;
}

/**
 * Fills lending fields with empty defaults and keeps `loan` aligned with the
 * open ledger row. Existing titles, notes, and locations are left untouched.
 */
export function lendingFields(book: BookEntry): {
  lentTo: string;
  lentAt: string;
  dueAt: string;
  returnedAt: string;
  loanLedger: LoanLedgerEntry[];
  loan: BookLoan | null;
} {
  const ledger = dedupeLedger((book.loanLedger ?? []).map(cleanLedgerEntry).filter((entry): entry is LoanLedgerEntry => entry != null));

  const legacyName = cleanText(book.loan?.borrowerName);
  if (legacyName && !ledger.some((entry) => !entry.returnedAt)) {
    ledger.push({
      lentTo: legacyName,
      lentAt: cleanText(book.loan?.lentAt),
      dueAt: cleanText(book.loan?.dueAt),
      returnedAt: '',
    });
  }

  if (ledger.length === 0 && cleanText(book.lentTo)) {
    ledger.push({
      lentTo: cleanText(book.lentTo),
      lentAt: cleanText(book.lentAt),
      dueAt: cleanText(book.dueAt),
      returnedAt: cleanText(book.returnedAt),
    });
  }

  const deduped = dedupeLedger(ledger);
  const open = [...deduped].reverse().find((entry) => !entry.returnedAt);
  const current = open ?? deduped[deduped.length - 1];

  if (!current) return { ...EMPTY_LENDING, loanLedger: [] };

  return {
    lentTo: current.lentTo,
    lentAt: current.lentAt,
    dueAt: current.dueAt,
    returnedAt: open ? '' : current.returnedAt,
    loanLedger: deduped,
    loan: open
      ? {
          borrowerName: open.lentTo,
          lentAt: open.lentAt,
          dueAt: open.dueAt || null,
        }
      : null,
  };
}

/** The loan that is still out, or null when the copy is on the shelf. */
export function openLoan(book: BookEntry): LoanLedgerEntry | null {
  const ledger = Array.isArray(book.loanLedger) ? book.loanLedger : [];
  for (let index = ledger.length - 1; index >= 0; index -= 1) {
    const entry = cleanLedgerEntry(ledger[index]);
    if (entry && !entry.returnedAt) return entry;
  }
  const legacyName = cleanText(book.loan?.borrowerName);
  if (legacyName) {
    return {
      lentTo: legacyName,
      lentAt: cleanText(book.loan?.lentAt),
      dueAt: cleanText(book.loan?.dueAt),
      returnedAt: '',
    };
  }
  if (cleanText(book.lentTo) && !cleanText(book.returnedAt)) {
    return {
      lentTo: cleanText(book.lentTo),
      lentAt: cleanText(book.lentAt),
      dueAt: cleanText(book.dueAt),
      returnedAt: '',
    };
  }
  return null;
}

export function returnedLoans(book: BookEntry): LoanLedgerEntry[] {
  return lendingFields(book).loanLedger.filter((entry) => entry.returnedAt);
}

export function isOnLoan(book: BookEntry): boolean {
  return openLoan(book) != null;
}

function parseDueDate(due: string): Date | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due.trim());
  if (day) {
    const parsed = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 23, 59, 59, 999);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(due);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function loanDueDate(book: BookEntry): Date | null {
  const due = openLoan(book)?.dueAt;
  if (!due) return null;
  return parseDueDate(due);
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

/** In-app reminder label. Null when the copy is not out. */
export function loanBadgeText(book: BookEntry, now = new Date()): string | null {
  if (!isOnLoan(book)) return null;
  if (isLoanOverdue(book, now)) return 'Overdue';
  if (openLoan(book)?.dueAt) return formatLoanDue(book, now);
  return 'Lent out';
}

export function formatLentSince(book: BookEntry): string {
  const open = openLoan(book);
  if (!open) return '';
  const day = open.lentAt.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return `Lent to ${open.lentTo} since ${day}`;
  return `Lent to ${open.lentTo}`;
}

export function lendBook(
  book: BookEntry,
  input: { borrowerName?: string; lentTo?: string; dueAt?: string | null; lentAt?: string },
): BookEntry {
  const lentTo = cleanText(input.lentTo ?? input.borrowerName);
  const current = lendingFields(book);
  if (!lentTo || current.loan) {
    return { ...book, ...current };
  }
  const lentAt = cleanText(input.lentAt) || new Date().toISOString();
  const dueAt = cleanText(input.dueAt);
  const entry: LoanLedgerEntry = { lentTo, lentAt, dueAt, returnedAt: '' };
  return {
    ...book,
    ...lendingFields({
      ...book,
      lentTo,
      lentAt,
      dueAt,
      returnedAt: '',
      loan: { borrowerName: lentTo, lentAt, dueAt: dueAt || null },
      loanLedger: [...current.loanLedger, entry],
    }),
  };
}

export function returnBook(book: BookEntry, returnedAt?: string): BookEntry {
  const current = lendingFields(book);
  if (!current.loanLedger.some((entry) => !entry.returnedAt)) {
    return { ...book, ...current };
  }
  const stamp = cleanText(returnedAt) || new Date().toISOString();
  let closed = false;
  const loanLedger = [...current.loanLedger].reverse().map((entry) => {
    if (!closed && !entry.returnedAt) {
      closed = true;
      return { ...entry, returnedAt: stamp };
    }
    return entry;
  }).reverse();
  const latest = loanLedger[loanLedger.length - 1];
  return {
    ...book,
    ...lendingFields({
      ...book,
      loan: null,
      lentTo: latest?.lentTo ?? '',
      lentAt: latest?.lentAt ?? '',
      dueAt: latest?.dueAt ?? '',
      returnedAt: stamp,
      loanLedger,
    }),
  };
}

/** Prefer `primary` when both copies are out. Closed rows from both are kept. */
export function mergeLoanLedgers(primary: BookEntry, secondary: BookEntry): ReturnType<typeof lendingFields> {
  const a = lendingFields(primary);
  const b = lendingFields(secondary);
  const primaryOpen = a.loanLedger.find((entry) => !entry.returnedAt);
  const secondaryOpen = b.loanLedger.find((entry) => !entry.returnedAt);
  const closed = [
    ...a.loanLedger.filter((entry) => entry.returnedAt),
    ...b.loanLedger.filter((entry) => entry.returnedAt),
  ];
  if (primaryOpen && secondaryOpen) {
    closed.push({ ...secondaryOpen, returnedAt: secondaryOpen.lentAt || primaryOpen.lentAt });
  }
  const open = primaryOpen ?? secondaryOpen ?? null;
  return lendingFields({
    ...primary,
    loan: null,
    lentTo: '',
    lentAt: '',
    dueAt: '',
    returnedAt: '',
    loanLedger: open ? [...closed, open] : closed,
  });
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
