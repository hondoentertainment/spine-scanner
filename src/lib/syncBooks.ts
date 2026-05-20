import { supabase } from './supabase.ts';
import type { BookEntry, MetadataSource, Shelf, UserEditedFields } from '../types.ts';
import { addBreadcrumb, captureException } from './errorMonitoring.ts';

/** Row shape in the Supabase `books` table */
interface BookRow {
  id: string;
  user_id: string;
  isbn: string;
  is_photo_only?: boolean;
  title: string;
  author: string;
  page_count: number;
  amazon_link: string;
  cover_img: string;
  status: string;
  notes: string;
  date_added: string;
  shelf_ids: string[];
  needs_review?: boolean;
  review_reason?: string;
  pages_finished?: number;
  started_at?: string | null;
  finished_at?: string | null;
  last_progress_at?: string | null;
  metadata_source?: MetadataSource | null;
  user_edited_fields?: UserEditedFields | null;
  updated_at: string;
}

/** Row shape in the Supabase `shelves` table */
interface ShelfRow {
  id: string;
  user_id: string;
  name: string;
  color: string;
}

// ─── Converters ─────────────────────────────────────────────────

export function toBookEntry(row: BookRow): BookEntry {
  return {
    id: row.id,
    isbn: row.isbn,
    isPhotoOnly: row.is_photo_only ?? false,
    title: row.title,
    author: row.author,
    pageCount: row.page_count,
    amazonLink: row.amazon_link,
    coverImg: row.cover_img,
    status: row.status as BookEntry['status'],
    notes: row.notes,
    dateAdded: row.date_added,
    shelfIds: row.shelf_ids || [],
    needsReview: row.needs_review ?? false,
    reviewReason: row.review_reason ?? '',
    pagesFinished: row.pages_finished ?? 0,
    startedAt: row.started_at ?? null,
    finishedAt: row.finished_at ?? null,
    lastProgressAt: row.last_progress_at ?? null,
    ...(row.metadata_source ? { metadataSource: row.metadata_source } : {}),
    ...(row.user_edited_fields && Object.keys(row.user_edited_fields).length > 0
      ? { userEditedFields: row.user_edited_fields }
      : {}),
  };
}

export function toBookRow(book: BookEntry, userId: string): Omit<BookRow, 'updated_at'> {
  return {
    id: book.id,
    user_id: userId,
    isbn: book.isbn,
    is_photo_only: book.isPhotoOnly ?? false,
    title: book.title,
    author: book.author,
    page_count: book.pageCount,
    amazon_link: book.amazonLink,
    cover_img: book.coverImg,
    status: book.status,
    notes: book.notes,
    date_added: book.dateAdded,
    shelf_ids: book.shelfIds || [],
    needs_review: book.needsReview ?? false,
    review_reason: book.reviewReason ?? '',
    pages_finished: book.pagesFinished ?? 0,
    started_at: book.startedAt ?? null,
    finished_at: book.finishedAt ?? null,
    last_progress_at: book.lastProgressAt ?? null,
    metadata_source: book.metadataSource ?? null,
    user_edited_fields: book.userEditedFields ?? {},
  };
}

function toShelf(row: ShelfRow): Shelf {
  return { id: row.id, name: row.name, color: row.color };
}

function toShelfRow(shelf: Shelf, userId: string): ShelfRow {
  return { id: shelf.id, user_id: userId, name: shelf.name, color: shelf.color };
}

// ─── Sync operations ────────────────────────────────────────────

/**
 * Pull the user's full book library from Supabase.
 * Returns null if Supabase is not configured or there's an error.
 */
export async function pullBooks(userId: string): Promise<BookEntry[] | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('user_id', userId)
    .order('date_added', { ascending: false });

  if (error) {
    console.error('[sync] Error pulling books:', error.message);
    captureException(error, { area: 'pullBooks', userId });
    return null;
  }

  return (data as BookRow[]).map(toBookEntry);
}

/** Pull the user's shelves from Supabase. */
export async function pullShelves(userId: string): Promise<Shelf[] | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('shelves')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error('[sync] Error pulling shelves:', error.message);
    captureException(error, { area: 'pullShelves', userId });
    return null;
  }

  return (data as ShelfRow[]).map(toShelf);
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
    const { error } = await supabase
      .from('books')
      .upsert(rows, { onConflict: 'id' });

    if (error) {
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
    const { error: deleteError } = await supabase
      .from('books')
      .delete()
      .eq('user_id', userId)
      .in('id', toDelete);

    if (deleteError) {
      console.error('[sync] Error deleting stale books:', deleteError.message);
      captureException(deleteError, { area: 'pushBooks.deleteStale', userId, staleCount: toDelete.length });
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
    const { error } = await supabase
      .from('shelves')
      .upsert(rows, { onConflict: 'id' });

    if (error) {
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
    const { error: deleteError } = await supabase
      .from('shelves')
      .delete()
      .eq('user_id', userId)
      .in('id', toDeleteIds);

    if (deleteError) {
      console.error('[sync] Error deleting stale shelves:', deleteError.message);
      captureException(deleteError, { area: 'pushShelves.deleteStale', userId, staleCount: toDeleteIds.length });
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

  const mergedBooks = mergeBooksLists(localBooks, remoteBooks);
  const mergedShelves = mergeShelvesLists(localShelves, remoteShelves || []);

  const pushOk = await pushBooks(userId, mergedBooks);
  if (!pushOk) return null;

  const shelvesPushOk = await pushShelves(userId, mergedShelves);
  if (!shelvesPushOk) return null;

  addBreadcrumb('sync', 'Merge sync completed', {
    mergedBooks: mergedBooks.length,
    mergedShelves: mergedShelves.length,
  });

  return { books: mergedBooks, shelves: mergedShelves };
}
