import type { BookEntry } from '../types.ts';

export interface BookConflictSnapshot {
  bookId: string;
  local: BookEntry;
  remote: BookEntry;
}

function loanKey(book: BookEntry): string {
  const name = book.loan?.borrowerName?.trim() ?? '';
  const due = book.loan?.dueAt ?? '';
  return `${name}|${due}`;
}

/** True when the copies a person would notice (title, author, notes, loan) differ. */
export function booksConflict(local: BookEntry, remote: BookEntry): boolean {
  return (
    local.title !== remote.title
    || local.author !== remote.author
    || local.notes !== remote.notes
    || loanKey(local) !== loanKey(remote)
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
