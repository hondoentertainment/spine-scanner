import { supabase } from './supabase.ts';
import type { BookEntry, Shelf } from '../types.ts';
import { addBreadcrumb, captureException } from './errorMonitoring.ts';
import { migrateBooks } from './schemaMigrations.ts';
import { findBookConflicts } from './bookConflicts.ts';
import { withRetry } from './syncRetry.ts';
import { useSyncQueue } from '../store/useSyncQueue.ts';
import { fetchUserBooks, fetchUserShelves, toBookEntry, toBookRow, toShelfRow } from '../../packages/shared/src/booksApi.ts';

export { toBookEntry, toBookRow };

const LOCATION_COLUMNS = ['location_room', 'location_case', 'location_shelf'] as const;
const LOAN_LEDGER_COLUMNS = ['loan_ledger'] as const;
const OPTIONAL_BOOK_COLUMN_GROUPS = [LOCATION_COLUMNS, LOAN_LEDGER_COLUMNS] as const;

function schemaErrorMessage(error: unknown): { message: string; schemaMiss: boolean } {
  if (!error || typeof error !== 'object') return { message: '', schemaMiss: false };
  const record = error as { message?: unknown; code?: unknown };
  const message = typeof record.message === 'string' ? record.message.toLowerCase() : '';
  const code = typeof record.code === 'string' ? record.code : '';
  const schemaMiss = (
    code === 'PGRST204'
    || code === '42703'
    || message.includes('schema cache')
    || message.includes('does not exist')
    || message.includes('could not find')
  );
  return { message, schemaMiss };
}

/** Columns to omit when the database has not been migrated yet. A named column strips its whole group. */
export function missingOptionalBookColumns(error: unknown): string[] {
  const { message, schemaMiss } = schemaErrorMessage(error);
  if (!schemaMiss) return [];
  const missing: string[] = [];
  for (const group of OPTIONAL_BOOK_COLUMN_GROUPS) {
    if (group.some((column) => message.includes(column))) missing.push(...group);
  }
  return missing;
}

/** True when PostgREST or Postgres rejected the write because location columns are not migrated yet. */
export function isMissingLocationColumnError(error: unknown): boolean {
  return missingOptionalBookColumns(error).some((column) => column.startsWith('location_'));
}

function omitBookColumns<T extends object>(row: T, columns: readonly string[]): T {
  const next: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const key of columns) delete next[key];
  return next as T;
}

/**
 * Pull the user's full book library from Supabase.
 * Returns null if Supabase is not configured or there's an error.
 */
export async function pullBooks(userId: string): Promise<BookEntry[] | null> {
  if (!supabase) return null;

  const result = await fetchUserBooks(supabase, userId);
  if (result.error) {
    console.error('[sync] Error pulling books:', result.error.message);
    captureException(result.error, { area: 'pullBooks', userId });
    return null;
  }

  return migrateBooks(result.data);
}

/** Pull the user's shelves from Supabase. */
export async function pullShelves(userId: string): Promise<Shelf[] | null> {
  if (!supabase) return null;

  const result = await fetchUserShelves(supabase, userId);
  if (result.error) {
    console.error('[sync] Error pulling shelves:', result.error.message);
    captureException(result.error, { area: 'pullShelves', userId });
    return null;
  }

  return result.data;
}


/**
 * Push the full local library to Supabase (upsert strategy).
 * This overwrites the remote library with whatever is local — simple & conflict-free.
 */
export async function pushBooks(userId: string, books: BookEntry[]): Promise<boolean> {
  if (!supabase) return false;
  addBreadcrumb('sync', 'Pushing books', { books: books.length });

  const rows = books.map((b) => ({
    ...toBookRow(b, userId),
    updated_at: new Date().toISOString(),
  }));

  // Upsert all books (insert or update on conflict by primary key `id`)
  if (rows.length > 0) {
    try {
      await withRetry(async () => {
        let payload = rows;
        const stripped = new Set<string>();
        for (;;) {
          const { error } = await supabase!
            .from('books')
            .upsert(payload, { onConflict: 'id' });
          if (!error) return;
          const missing = missingOptionalBookColumns(error).filter((column) => !stripped.has(column));
          if (missing.length === 0) throw error;
          for (const column of missing) stripped.add(column);
          payload = rows.map((row) => omitBookColumns(row, [...stripped]));
          if (missing.some((column) => column.startsWith('location_'))) {
            console.warn(
              '[sync] books.location_room/location_case/location_shelf are missing. Synced without physical location. Run supabase/migrations/007_books_physical_location.sql.',
            );
          }
          if (missing.includes('loan_ledger')) {
            console.warn(
              '[sync] books.loan_ledger is missing. Synced the current loan only. Run supabase/migrations/008_books_loan_ledger.sql.',
            );
          }
        }
      });
    } catch (err) {
      const error = err as Error;
      console.error('[sync] Error pushing books:', error.message);
      captureException(error, { area: 'pushBooks.upsert', userId, bookCount: books.length });
      return false;
    }
  }

  // Delete remote books that are no longer in local library
  const localIds = books.map((b) => b.id);

  const { data: remoteBooks, error: fetchError } = await supabase
    .from('books')
    .select('id')
    .eq('user_id', userId);

  if (fetchError) {
    console.error('[sync] Error fetching remote IDs:', fetchError.message);
    captureException(fetchError, { area: 'pushBooks.fetchRemoteIds', userId });
    return false;
  }

  const remoteIds = (remoteBooks as { id: string }[]).map((r) => r.id);
  const toDelete = remoteIds.filter((id) => !localIds.includes(id));

  if (toDelete.length > 0) {
    try {
      await withRetry(async () => {
        const { error: deleteError } = await supabase!
          .from('books')
          .delete()
          .in('id', toDelete);
        if (deleteError) throw deleteError;
      });
    } catch (err) {
      const error = err as Error;
      console.error('[sync] Error deleting stale books:', error.message);
      captureException(error, { area: 'pushBooks.deleteStale', userId, staleCount: toDelete.length });
      return false;
    }
  }

  return true;
}

/** Push shelves to Supabase (upsert + delete stale). */
export async function pushShelves(userId: string, shelves: Shelf[]): Promise<boolean> {
  if (!supabase) return false;
  addBreadcrumb('sync', 'Pushing shelves', { shelves: shelves.length });

  const rows = shelves.map((s) => toShelfRow(s, userId));

  if (rows.length > 0) {
    try {
      await withRetry(async () => {
        const { error } = await supabase!
          .from('shelves')
          .upsert(rows, { onConflict: 'id' });
        if (error) throw error;
      });
    } catch (err) {
      const error = err as Error;
      console.error('[sync] Error pushing shelves:', error.message);
      captureException(error, { area: 'pushShelves.upsert', userId, shelfCount: shelves.length });
      return false;
    }
  }

  // Delete stale remote shelves
  const localIds = shelves.map((s) => s.id);

  const { data: remoteShelves, error: fetchError } = await supabase
    .from('shelves')
    .select('id')
    .eq('user_id', userId);

  if (fetchError) {
    console.error('[sync] Error fetching remote shelf IDs:', fetchError.message);
    captureException(fetchError, { area: 'pushShelves.fetchRemoteIds', userId });
    return false;
  }

  const remoteIds = (remoteShelves as { id: string }[]).map((r) => r.id);
  const toDeleteIds = remoteIds.filter((id) => !localIds.includes(id));

  if (toDeleteIds.length > 0) {
    try {
      await withRetry(async () => {
        const { error: deleteError } = await supabase!
          .from('shelves')
          .delete()
          .in('id', toDeleteIds);
        if (deleteError) throw deleteError;
      });
    } catch (err) {
      const error = err as Error;
      console.error('[sync] Error deleting stale shelves:', error.message);
      captureException(error, { area: 'pushShelves.deleteStale', userId, staleCount: toDeleteIds.length });
      return false;
    }
  }

  return true;
}

/**
 * Merge two book lists: combine all unique IDs, local wins on conflict.
 * This is a pure function — useful for testing independently of Supabase.
 */
export function mergeBooksLists(localBooks: BookEntry[], remoteBooks: BookEntry[]): BookEntry[] {
  const remoteMap = new Map(remoteBooks.map((b) => [b.id, b]));
  const localMap = new Map(localBooks.map((b) => [b.id, b]));

  const allIds = new Set([...remoteMap.keys(), ...localMap.keys()]);
  const merged: BookEntry[] = [];

  for (const id of allIds) {
    const local = localMap.get(id);
    const remote = remoteMap.get(id);

    if (local) {
      merged.push(local);
    } else if (remote) {
      merged.push(remote);
    }
  }

  merged.sort((a, b) => b.dateAdded.localeCompare(a.dateAdded));
  return merged;
}

/** Merge two shelf lists: local wins on conflict. */
export function mergeShelvesLists(localShelves: Shelf[], remoteShelves: Shelf[]): Shelf[] {
  const remoteMap = new Map(remoteShelves.map((s) => [s.id, s]));
  const localMap = new Map(localShelves.map((s) => [s.id, s]));

  const allIds = new Set([...remoteMap.keys(), ...localMap.keys()]);
  const merged: Shelf[] = [];

  for (const id of allIds) {
    const local = localMap.get(id);
    const remote = remoteMap.get(id);

    if (local) {
      merged.push(local);
    } else if (remote) {
      merged.push(remote);
    }
  }

  return merged;
}

/**
 * Permanently deletes all of a user's data from Supabase.
 * Removes every row from `books` and `shelves` owned by the user, plus the
 * profile row keyed on `id = userId`. Returns true on success, false otherwise.
 */
export async function deleteAllCloudData(userId: string): Promise<boolean> {
  if (!supabase) return false;
  addBreadcrumb('sync', 'Deleting all cloud data', { userId });

  try {
    const { error: booksError } = await supabase
      .from('books')
      .delete()
      .eq('user_id', userId);
    if (booksError) throw booksError;
  } catch (err) {
    const error = err as Error;
    console.error('[sync] Error deleting cloud books:', error.message);
    captureException(error, { area: 'deleteAllCloudData.books', userId });
    return false;
  }

  try {
    const { error: shelvesError } = await supabase
      .from('shelves')
      .delete()
      .eq('user_id', userId);
    if (shelvesError) throw shelvesError;
  } catch (err) {
    const error = err as Error;
    console.error('[sync] Error deleting cloud shelves:', error.message);
    captureException(error, { area: 'deleteAllCloudData.shelves', userId });
    return false;
  }

  try {
    const { error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId);
    if (profileError) throw profileError;
  } catch (err) {
    const error = err as Error;
    console.error('[sync] Error deleting profile:', error.message);
    captureException(error, { area: 'deleteAllCloudData.profile', userId });
    return false;
  }

  return true;
}

/**
 * Smart merge: pulls remote, merges with local (local wins on conflict),
 * then pushes merged result back.
 */
export async function mergeSync(
  userId: string,
  localBooks: BookEntry[],
  localShelves: Shelf[] = [],
): Promise<{ books: BookEntry[]; shelves: Shelf[] } | null> {
  if (!supabase) return null;
  addBreadcrumb('sync', 'Merge sync started', {
    localBooks: localBooks.length,
    localShelves: localShelves.length,
  });

  const remoteBooks = await pullBooks(userId);
  if (remoteBooks === null) return null;

  const remoteShelves = await pullShelves(userId);

  // Keep both copies so the profile can offer "this device" vs "other device".
  const conflicts = findBookConflicts(localBooks, remoteBooks);

  const mergedBooks = migrateBooks(mergeBooksLists(localBooks, remoteBooks));
  const mergedShelves = mergeShelvesLists(localShelves, remoteShelves || []);

  // Save snapshot of local books before pushing
  useSyncQueue.getState().saveSnapshot(localBooks);

  const pushOk = await pushBooks(userId, mergedBooks);
  if (!pushOk) return null;

  await pushShelves(userId, mergedShelves);

  // Record conflict status and both copies so the UI can list and resolve them.
  useSyncQueue.getState().setBookConflicts(conflicts);

  addBreadcrumb('sync', 'Merge sync completed', {
    mergedBooks: mergedBooks.length,
    mergedShelves: mergedShelves.length,
  });

  return { books: mergedBooks, shelves: mergedShelves };
}
