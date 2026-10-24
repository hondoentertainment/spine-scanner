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

/**
 * Columns added after `000_books_shelves.sql`. PostgREST names one missing
 * column at a time, so a named column strips its whole migration group and
 * the write is tried again. `009_books_app_columns.sql` adds all of these.
 */
const OPTIONAL_BOOK_COLUMN_GROUPS = [
  ['is_photo_only', 'needs_review', 'review_reason', 'pages_finished', 'started_at', 'finished_at', 'last_progress_at'],
  ['metadata_source', 'user_edited_fields'],
  ['loan'],
  ['loan_ledger'],
  ['location_room', 'location_case', 'location_shelf'],
] as const;

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

/** Match a column as its own identifier so `loan` does not also match `loan_ledger`. */
function messageMentionsColumn(message: string, column: string): boolean {
  return new RegExp(`(^|[^a-z0-9_])${column}([^a-z0-9_]|$)`).test(message);
}

function omitBookColumns<T extends object>(row: T, columns: readonly string[]): T {
  const next: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const key of columns) delete next[key];
  return next as T;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Could not save to the cloud.';
}

function warnForMissingColumns(missing: readonly string[]): void {
  if (missing.includes('is_photo_only')) {
    console.warn(
      '[sync] books review and progress columns are missing. Synced without them. Run supabase/migrations/004_books_review_and_progress.sql or 009_books_app_columns.sql.',
    );
  }
  if (missing.includes('metadata_source')) {
    console.warn(
      '[sync] books.metadata_source/user_edited_fields are missing. Synced without metadata source. Run supabase/migrations/005_books_metadata_source.sql or 009_books_app_columns.sql.',
    );
  }
  if (missing.includes('loan')) {
    console.warn(
      '[sync] books.loan is missing. Synced without the current loan. Run supabase/migrations/006_books_loan.sql or 009_books_app_columns.sql.',
    );
  }
  if (missing.includes('loan_ledger')) {
    console.warn(
      '[sync] books.loan_ledger is missing. Synced the current loan only. Run supabase/migrations/008_books_loan_ledger.sql or 009_books_app_columns.sql.',
    );
  }
  if (missing.some((column) => column.startsWith('location_'))) {
    console.warn(
      '[sync] books.location_room/location_case/location_shelf are missing. Synced without physical location. Run supabase/migrations/007_books_physical_location.sql or 009_books_app_columns.sql.',
    );
  }
}

/** Columns to omit when the database has not been migrated yet. A named column strips its whole group. */
export function missingOptionalBookColumns(error: unknown): string[] {
  const { message, schemaMiss } = schemaErrorMessage(error);
  if (!schemaMiss) return [];
  const missing: string[] = [];
  for (const group of OPTIONAL_BOOK_COLUMN_GROUPS) {
    if (group.some((column) => messageMentionsColumn(message, column))) missing.push(...group);
  }
  return missing;
}

/** True when PostgREST or Postgres rejected the write because location columns are not migrated yet. */
export function isMissingLocationColumnError(error: unknown): boolean {
  return missingOptionalBookColumns(error).some((column) => column.startsWith('location_'));
}

type BookUpsertRow = Omit<BookRow, 'updated_at'> & { updated_at: string };

/**
 * Insert or replace book rows. Retries without column groups the database
 * does not have yet, so a library that only ran the base books/shelves
 * migration still accepts the save.
 */
export async function upsertBookRows(
  client: SupabaseClient,
  rows: BookUpsertRow[],
): Promise<void> {
  if (rows.length === 0) return;
  let payload: BookUpsertRow[] = rows;
  const stripped = new Set<string>();
  for (;;) {
    const { error } = await client.from('books').upsert(payload, { onConflict: 'id' });
    if (!error) return;
    const missing = missingOptionalBookColumns(error).filter((column) => !stripped.has(column));
    if (missing.length === 0) throw error;
    for (const column of missing) stripped.add(column);
    payload = rows.map((row) => omitBookColumns(row, [...stripped]));
    warnForMissingColumns(missing);
  }
}

/** Insert or replace shelf rows. Does not delete shelves that are absent from `rows`. */
export async function upsertShelfRows(
  client: SupabaseClient,
  rows: ShelfRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await client.from('shelves').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
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

/** Insert or replace book rows. Does not delete rows that are absent from `books`. */
export async function upsertUserBooks(
  client: SupabaseClient,
  userId: string,
  books: BookEntry[],
): Promise<LibraryQueryError | null> {
  if (books.length === 0) return null;
  const updatedAt = new Date().toISOString();
  try {
    await upsertBookRows(
      client,
      books.map((book) => ({ ...toBookRow(book, userId), updated_at: updatedAt })),
    );
    return null;
  } catch (error) {
    return { message: errorMessage(error) };
  }
}

/** Insert or replace one book row. Retries when later migration columns are missing. */
export async function upsertUserBook(
  client: SupabaseClient,
  userId: string,
  book: BookEntry,
): Promise<LibraryQueryError | null> {
  return upsertUserBooks(client, userId, [book]);
}

/** Insert or replace shelf rows. Does not delete shelves that are absent from `shelves`. */
export async function upsertUserShelves(
  client: SupabaseClient,
  userId: string,
  shelves: Shelf[],
): Promise<LibraryQueryError | null> {
  try {
    await upsertShelfRows(client, shelves.map((shelf) => toShelfRow(shelf, userId)));
    return null;
  } catch (error) {
    return { message: errorMessage(error) };
  }
}
