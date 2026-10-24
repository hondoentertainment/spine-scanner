import { supabase } from './supabase.ts';
import type { BookEntry, Shelf } from '../types.ts';
import { addBreadcrumb, captureException } from './errorMonitoring.ts';
import { migrateBooks } from './schemaMigrations.ts';
import { findBookConflicts } from './bookConflicts.ts';
import { withRetry } from './syncRetry.ts';
import { useSyncQueue } from '../store/useSyncQueue.ts';
import {
  fetchUserBooks,
  fetchUserShelves,
  isMissingLocationColumnError,
  missingOptionalBookColumns,
  toBookEntry,
  toBookRow,
  toShelfRow,
  upsertBookRows,
  upsertShelfRows,
} from '../../packages/shared/src/booksApi.ts';
import { mergeBooksLists, mergeShelvesLists } from '../../packages/shared/src/libraryMerge.ts';

export { toBookEntry, toBookRow, isMissingLocationColumnError, missingOptionalBookColumns, mergeBooksLists, mergeShelvesLists };

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
        await upsertBookRows(supabase!, rows);
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
        await upsertShelfRows(supabase!, rows);
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
