import type { BookEntry } from '../types.ts';

export interface SyncConflict {
  id: string;
  bookId: string;
  field: string;
  localValue: string;
  remoteValue: string;
  resolvedValue?: string;
  resolution?: 'local' | 'remote' | 'manual';
}

/** Fields on BookEntry that are compared for conflicts. */
const COMPARABLE_FIELDS: (keyof BookEntry)[] = [
  'title',
  'author',
  'status',
  'notes',
  'pageCount',
  'coverImg',
  'amazonLink',
  'rating',
  'pagesRead',
  'progressPercent',
  'startedReading',
  'finishedReading',
];

/** Fields typically edited by hand in the UI. */
const USER_EDIT_FIELDS = new Set<string>([
  'title',
  'author',
  'notes',
  'status',
  'rating',
  'pagesRead',
  'progressPercent',
  'startedReading',
  'finishedReading',
]);

function stringify(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value);
}

/**
 * Detect field-level conflicts between local and remote books.
 * Only books that exist in both lists and have differing fields produce conflicts.
 */
export function detectConflicts(
  localBooks: BookEntry[],
  remoteBooks: BookEntry[],
): SyncConflict[] {
  const remoteMap = new Map(remoteBooks.map((b) => [b.id, b]));
  const conflicts: SyncConflict[] = [];
  let conflictIndex = 0;

  for (const local of localBooks) {
    const remote = remoteMap.get(local.id);
    if (!remote) continue;

    for (const field of COMPARABLE_FIELDS) {
      const localVal = stringify(local[field]);
      const remoteVal = stringify(remote[field]);

      if (localVal !== remoteVal) {
        conflicts.push({
          id: `conflict-${conflictIndex++}`,
          bookId: local.id,
          field,
          localValue: localVal,
          remoteValue: remoteVal,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Apply resolutions to conflicts and return a merged book list.
 * Books only in local or only in remote are included as-is.
 * For books with conflicts, the resolved values are applied on top of the local copy.
 */
export function resolveConflicts(
  localBooks: BookEntry[],
  remoteBooks: BookEntry[],
  resolutions: SyncConflict[],
): BookEntry[] {
  const localMap = new Map(localBooks.map((b) => [b.id, { ...b }]));
  const remoteMap = new Map(remoteBooks.map((b) => [b.id, b]));

  // Build a resolution lookup: bookId -> field -> resolvedValue
  const resolutionMap = new Map<string, Map<string, string>>();
  for (const r of resolutions) {
    if (!r.resolution && r.resolvedValue === undefined) continue;
    if (!resolutionMap.has(r.bookId)) {
      resolutionMap.set(r.bookId, new Map());
    }
    const fieldMap = resolutionMap.get(r.bookId)!;

    let value: string;
    if (r.resolution === 'local') {
      value = r.localValue;
    } else if (r.resolution === 'remote') {
      value = r.remoteValue;
    } else {
      value = r.resolvedValue ?? r.localValue;
    }
    fieldMap.set(r.field, value);
  }

  // Apply resolutions to local copies
  for (const [bookId, fieldMap] of resolutionMap) {
    const book = localMap.get(bookId);
    if (!book) continue;

    for (const [field, value] of fieldMap) {
      // Type-safe assignment for known fields
      if (field === 'pageCount' || field === 'rating' || field === 'pagesRead' || field === 'progressPercent') {
        (book as Record<string, unknown>)[field] = value === '' ? undefined : Number(value);
      } else {
        (book as Record<string, unknown>)[field] = value;
      }
    }

    localMap.set(bookId, book);
  }

  // Add remote-only books
  for (const [id, remote] of remoteMap) {
    if (!localMap.has(id)) {
      localMap.set(id, { ...remote });
    }
  }

  const merged = Array.from(localMap.values());
  merged.sort((a, b) => b.dateAdded.localeCompare(a.dateAdded));
  return merged;
}

/**
 * Simple auto-resolution strategy:
 * - User-edited fields (or fields listed in the book's userEditedFields) prefer local.
 * - Other fields prefer remote.
 */
export function autoResolveConflicts(
  conflicts: SyncConflict[],
  localBooks?: BookEntry[],
): SyncConflict[] {
  const localMap = localBooks
    ? new Map(localBooks.map((b) => [b.id, b]))
    : new Map<string, BookEntry>();

  return conflicts.map((c) => {
    const local = localMap.get(c.bookId);
    const userEdited = local?.userEditedFields ?? [];
    const isUserEdited =
      USER_EDIT_FIELDS.has(c.field) || userEdited.includes(c.field);

    return {
      ...c,
      resolution: isUserEdited ? 'local' as const : 'remote' as const,
      resolvedValue: isUserEdited ? c.localValue : c.remoteValue,
    };
  });
}
