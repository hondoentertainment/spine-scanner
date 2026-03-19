import { supabase } from './supabase.ts';
import type { BookEntry, Shelf } from '../types.ts';

/** Row shape in the Supabase `books` table */
interface BookRow {
  id: string;
  user_id: string;
  isbn: string;
  title: string;
  author: string;
  page_count: number;
  amazon_link: string;
  cover_img: string;
  status: string;
  notes: string;
  date_added: string;
  shelf_ids: string[];
  updated_at: string;
  deleted_at: string | null;
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
    title: row.title,
    author: row.author,
    pageCount: row.page_count,
    amazonLink: row.amazon_link,
    coverImg: row.cover_img,
    status: row.status as BookEntry['status'],
    notes: row.notes,
    dateAdded: row.date_added,
    shelfIds: row.shelf_ids || [],
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

export function toBookRow(book: BookEntry, userId: string): BookRow {
  return {
    id: book.id,
    user_id: userId,
    isbn: book.isbn,
    title: book.title,
    author: book.author,
    page_count: book.pageCount,
    amazon_link: book.amazonLink,
    cover_img: book.coverImg,
    status: book.status,
    notes: book.notes,
    date_added: book.dateAdded,
    shelf_ids: book.shelfIds || [],
    updated_at: book.updatedAt ?? new Date().toISOString(),
    deleted_at: book.deletedAt ?? null,
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
 * Pull the user's full book library from Supabase (including soft-deleted).
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
    return null;
  }

  return (data as ShelfRow[]).map(toShelf);
}

/**
 * Push the full local library to Supabase (upsert strategy).
 */
export async function pushBooks(userId: string, books: BookEntry[]): Promise<boolean> {
  if (!supabase) return false;

  const rows = books.map((b) => toBookRow(b, userId));

  if (rows.length > 0) {
    const { error } = await supabase
      .from('books')
      .upsert(rows, { onConflict: 'id' });

    if (error) {
      console.error('[sync] Error pushing books:', error.message);
      return false;
    }
  }

  return true;
}

/** Push shelves to Supabase (upsert + delete stale). */
export async function pushShelves(userId: string, shelves: Shelf[]): Promise<boolean> {
  if (!supabase) return false;

  const rows = shelves.map((s) => toShelfRow(s, userId));

  if (rows.length > 0) {
    const { error } = await supabase
      .from('shelves')
      .upsert(rows, { onConflict: 'id' });

    if (error) {
      console.error('[sync] Error pushing shelves:', error.message);
      return false;
    }
  }

  // Delete stale remote shelves (only hard-delete shelves — they have no soft-delete)
  const localIds = shelves.map((s) => s.id);

  const { data: remoteShelves, error: fetchError } = await supabase
    .from('shelves')
    .select('id')
    .eq('user_id', userId);

  if (fetchError) {
    console.error('[sync] Error fetching remote shelf IDs:', fetchError.message);
    return false;
  }

  const remoteIds = (remoteShelves as { id: string }[]).map((r) => r.id);
  const toDeleteIds = remoteIds.filter((id) => !localIds.includes(id));

  if (toDeleteIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('shelves')
      .delete()
      .in('id', toDeleteIds);

    if (deleteError) {
      console.error('[sync] Error deleting stale shelves:', deleteError.message);
      return false;
    }
  }

  return true;
}

/**
 * Merge two book lists using last-writer-wins based on `updatedAt` timestamps.
 * Books with a `deletedAt` tombstone are preserved for 30 days then purged by the store.
 *
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

    if (local && remote) {
      // Last-write-wins: pick whichever has the newer updatedAt
      const localTs = local.updatedAt ? Date.parse(local.updatedAt) : 0;
      const remoteTs = remote.updatedAt ? Date.parse(remote.updatedAt) : 0;
      merged.push(localTs >= remoteTs ? local : remote);
    } else if (local) {
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
    merged.push(local ?? remote!);
  }

  return merged;
}

// ─── Reconnect backoff ──────────────────────────────────────────

let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleReconnect(onReconnect: () => void) {
  if (reconnectTimer) return; // already scheduled
  const backoff = Math.min(1000 * 2 ** reconnectAttempt, 30_000);
  reconnectAttempt++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    onReconnect();
  }, backoff);
}

export function resetReconnectBackoff() {
  reconnectAttempt = 0;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

/**
 * Subscribe to Supabase realtime for the user's books table.
 * Automatically reconnects with exponential backoff on channel error.
 * Returns an unsubscribe function.
 */
export function subscribeToBooks(
  userId: string,
  onUpdate: () => void,
): () => void {
  if (!supabase) return () => {};

  let channel = supabase
    .channel(`books:user_id=eq.${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'books', filter: `user_id=eq.${userId}` }, () => {
      resetReconnectBackoff();
      onUpdate();
    })
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        scheduleReconnect(() => subscribeToBooks(userId, onUpdate));
      } else if (status === 'SUBSCRIBED') {
        resetReconnectBackoff();
      }
    });

  return () => {
    resetReconnectBackoff();
    void supabase?.removeChannel(channel);
  };
}

/**
 * Smart merge: pulls remote, merges with local (last-write-wins on updatedAt),
 * then pushes merged result back.
 */
export async function mergeSync(
  userId: string,
  localBooks: BookEntry[],
  localShelves: Shelf[] = [],
): Promise<{ books: BookEntry[]; shelves: Shelf[] } | null> {
  if (!supabase) return null;

  const remoteBooks = await pullBooks(userId);
  if (remoteBooks === null) return null;

  const remoteShelves = await pullShelves(userId);

  const mergedBooks = mergeBooksLists(localBooks, remoteBooks);
  const mergedShelves = mergeShelvesLists(localShelves, remoteShelves || []);

  const pushOk = await pushBooks(userId, mergedBooks);
  if (!pushOk) return null;

  await pushShelves(userId, mergedShelves);

  return { books: mergedBooks, shelves: mergedShelves };
}
