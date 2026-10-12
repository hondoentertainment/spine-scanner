import type { BookEntry } from '../types.ts';
import { lendingFields } from '../utils/loans.ts';
import { normalizePhysicalLocation } from '../utils/physicalLocation.ts';

export interface BookConflictSnapshot {
  bookId: string;
  local: BookEntry;
  remote: BookEntry;
}

function loanKey(book: BookEntry): string {
  const lending = lendingFields(book);
  const history = lending.loanLedger
    .map((entry) => `${entry.lentTo}|${entry.lentAt}|${entry.dueAt}|${entry.returnedAt}`)
    .join(';');
  return `${lending.lentTo}|${lending.dueAt}|${lending.returnedAt}|${history}`;
}

function locationKey(book: BookEntry): string {
  const location = normalizePhysicalLocation(book);
  return `${location.locationRoom}|${location.locationCase}|${location.locationShelf}`;
}

/** True when the copies a person would notice (title, author, notes, loan, physical location) differ. */
export function booksConflict(local: BookEntry, remote: BookEntry): boolean {
  return (
    local.title !== remote.title
    || local.author !== remote.author
    || local.notes !== remote.notes
    || loanKey(local) !== loanKey(remote)
    || locationKey(local) !== locationKey(remote)
  );
}

/** Books present on both devices whose visible fields differ. Local stays the working copy. */
export function findBookConflicts(localBooks: BookEntry[], remoteBooks: BookEntry[]): BookConflictSnapshot[] {
  const remoteMap = new Map(remoteBooks.map((book) => [book.id, book]));
  const conflicts: BookConflictSnapshot[] = [];
  for (const local of localBooks) {
    const remote = remoteMap.get(local.id);
    if (!remote || !booksConflict(local, remote)) continue;
    conflicts.push({ bookId: local.id, local, remote });
  }
  return conflicts;
}
