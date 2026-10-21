import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookEntry, LoanLedgerEntry, MetadataSource, Shelf, UserEditedFields } from './types';
import { lendingFields } from './loans';
import { cleanLocation } from './physicalLocation';

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
  loan?: BookEntry['loan'];
  loan_ledger?: LoanLedgerEntry[] | null;
  location_room?: string | null;
  location_case?: string | null;
  location_shelf?: string | null;
  updated_at: string;
}

interface ShelfRow {
  id: string;
  user_id: string;
  name: string;
  color: string;
}

export type LibraryQueryError = { message: string };

export type LibraryQueryResult<T> =
  | { data: T; error: null }
  | { data: null; error: LibraryQueryError };

/**
 * An older app marks a return by clearing `loan` and does not know about
 * `loan_ledger`. When the loan column is empty, close any open ledger rows
 * so a return made elsewhere is not undone on the next pull.
 */
function reconcileRemoteLedger(row: BookRow): LoanLedgerEntry[] {
  const ledger = Array.isArray(row.loan_ledger) ? row.loan_ledger : [];
  if (row.loan?.borrowerName?.trim()) return ledger;
  const returnedAt = row.updated_at || '';
  return ledger.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const name = typeof entry.lentTo === 'string' ? entry.lentTo.trim() : '';
    const alreadyReturned = typeof entry.returnedAt === 'string' && entry.returnedAt.trim();
    if (!name || alreadyReturned) return entry;
    return { ...entry, returnedAt: returnedAt || (typeof entry.lentAt === 'string' ? entry.lentAt : '') };
  });
}

function withLendingDefaults(book: BookEntry): BookEntry {
  return { ...book, ...lendingFields(book) };
}

export function toBookEntry(row: BookRow): BookEntry {
  return withLendingDefaults({
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
    ...(row.loan ? { loan: row.loan } : {}),
    loanLedger: reconcileRemoteLedger(row),
    locationRoom: cleanLocation(row.location_room),
    locationCase: cleanLocation(row.location_case),
    locationShelf: cleanLocation(row.location_shelf),
  });
}

export function toBookRow(book: BookEntry, userId: string): Omit<BookRow, 'updated_at'> {
  const lending = lendingFields(book);
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
    loan: lending.loan,
    loan_ledger: lending.loanLedger,
    location_room: cleanLocation(book.locationRoom),
    location_case: cleanLocation(book.locationCase),
    location_shelf: cleanLocation(book.locationShelf),
  };
}

export function toShelf(row: ShelfRow): Shelf {
  return { id: row.id, name: row.name, color: row.color };
}

export function toShelfRow(shelf: Shelf, userId: string): ShelfRow {
  return { id: shelf.id, user_id: userId, name: shelf.name, color: shelf.color };
}

/** Pull the user's books. Does not migrate schema; callers run `migrateBooks`. */
export async function fetchUserBooks(
  client: SupabaseClient,
  userId: string,
): Promise<LibraryQueryResult<BookEntry[]>> {
  const { data, error } = await client
    .from('books')
    .select('*')
    .eq('user_id', userId)
    .order('date_added', { ascending: false });

  if (error) return { data: null, error: { message: error.message } };
  return { data: (data as BookRow[]).map(toBookEntry), error: null };
}

/** Pull the user's shelves. */
export async function fetchUserShelves(
  client: SupabaseClient,
  userId: string,
): Promise<LibraryQueryResult<Shelf[]>> {
  const { data, error } = await client
    .from('shelves')
    .select('*')
    .eq('user_id', userId);

  if (error) return { data: null, error: { message: error.message } };
  return { data: (data as ShelfRow[]).map(toShelf), error: null };
}

/** Insert or replace one book row. Does not retry missing-column migrations. */
export async function upsertUserBook(
  client: SupabaseClient,
  userId: string,
  book: BookEntry,
): Promise<LibraryQueryError | null> {
  const row = {
    ...toBookRow(book, userId),
    updated_at: new Date().toISOString(),
  };
  const { error } = await client.from('books').upsert(row, { onConflict: 'id' });
  return error ? { message: error.message } : null;
}
