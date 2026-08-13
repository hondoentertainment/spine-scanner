import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BookEntry } from '../../types';

/**
 * Issue #41: branch coverage for the Supabase-backed sync operations.
 * `syncBooks.test.ts` covers the pure merge/converter functions; this file
 * covers pull/push error paths, stale-row deletion, and mergeSync's
 * conflict detection and partial-failure handling.
 */

interface TableMock {
  /** Resolves `{ data, error }` for select().eq()[.order()] chains. */
  select: ReturnType<typeof vi.fn>;
  /** Resolves `{ error }` for upsert(rows, opts). */
  upsert: ReturnType<typeof vi.fn>;
  /** Resolves `{ error }` for delete().in(col, ids). */
  deleteIn: ReturnType<typeof vi.fn>;
}

function makeTable(): TableMock {
  return {
    select: vi.fn().mockResolvedValue({ data: [], error: null }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    deleteIn: vi.fn().mockResolvedValue({ error: null }),
  };
}

const tables: Record<string, TableMock> = {
  books: makeTable(),
  shelves: makeTable(),
};

vi.mock('../supabase', () => ({
  supabase: {
    from: (name: string) => {
      const t = tables[name];
      return {
        select: () => ({
          eq: () => ({
            order: () => t.select(),
            // pullShelves / pushBooks await the eq() chain directly.
            then: (
              onFulfilled: (v: unknown) => unknown,
              onRejected: (e: unknown) => unknown,
            ) => t.select().then(onFulfilled, onRejected),
          }),
        }),
        upsert: (...args: unknown[]) => t.upsert(...args),
        delete: () => ({
          in: (...args: unknown[]) => t.deleteIn(...args),
        }),
      };
    },
  },
}));

vi.mock('../syncRetry', () => ({
  withRetry: (fn: () => Promise<unknown>) => fn(),
}));

vi.mock('../errorMonitoring', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

const saveSnapshot = vi.fn();
const setConflictBookIds = vi.fn();
vi.mock('../../store/useSyncQueue', () => ({
  useSyncQueue: { getState: () => ({ saveSnapshot, setConflictBookIds }) },
}));

// Import AFTER the mocks so the implementation picks them up.
import { pullBooks, pullShelves, pushBooks, pushShelves, mergeSync } from '../syncBooks';
import { captureException } from '../errorMonitoring';

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'b1',
  isbn: '9780141036144',
  title: 'Test Book',
  author: 'Test Author',
  pageCount: 200,
  amazonLink: 'https://amazon.com',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: '2026-01-15T00:00:00.000Z',
  shelfIds: [],
  ...overrides,
});

const makeRow = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  user_id: 'user-1',
  isbn: '9780141036144',
  title: `Title ${id}`,
  author: 'Author',
  page_count: 100,
  amazon_link: '',
  cover_img: '',
  status: 'to-read',
  notes: '',
  date_added: '2026-01-10T00:00:00.000Z',
  shelf_ids: [],
  updated_at: '2026-01-10T00:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  for (const name of Object.keys(tables)) {
    const fresh = makeTable();
    tables[name].select = fresh.select;
    tables[name].upsert = fresh.upsert;
    tables[name].deleteIn = fresh.deleteIn;
  }
  vi.mocked(captureException).mockClear();
  saveSnapshot.mockClear();
  setConflictBookIds.mockClear();
});

describe('pullBooks', () => {
  it('maps rows to BookEntry with defaults on success', async () => {
    tables.books.select.mockResolvedValueOnce({
      data: [makeRow('b1', { metadata_source: null, user_edited_fields: {} })],
      error: null,
    });

    const books = await pullBooks('user-1');

    expect(books).toHaveLength(1);
    expect(books![0].id).toBe('b1');
    expect(books![0].needsReview).toBe(false);
    // Null source and empty edited-fields are dropped, not stored.
    expect(books![0].metadataSource).toBeUndefined();
    expect(books![0].userEditedFields).toBeUndefined();
  });

  it('returns null and reports when the query errors', async () => {
    tables.books.select.mockResolvedValueOnce({ data: null, error: { message: 'pull boom' } });

    await expect(pullBooks('user-1')).resolves.toBeNull();
    expect(captureException).toHaveBeenCalledOnce();
  });
});

describe('pullShelves', () => {
  it('maps rows to Shelf on success', async () => {
    tables.shelves.select.mockResolvedValueOnce({
      data: [{ id: 's1', user_id: 'user-1', name: 'Fiction', color: '#f00' }],
      error: null,
    });

    await expect(pullShelves('user-1')).resolves.toEqual([
      { id: 's1', name: 'Fiction', color: '#f00' },
    ]);
  });

  it('returns null and reports when the query errors', async () => {
    tables.shelves.select.mockResolvedValueOnce({ data: null, error: { message: 'shelf boom' } });

    await expect(pullShelves('user-1')).resolves.toBeNull();
    expect(captureException).toHaveBeenCalledOnce();
  });
});

describe('pushBooks', () => {
  it('upserts local books and deletes stale remote rows', async () => {
    tables.books.select.mockResolvedValueOnce({
      data: [{ id: 'b1' }, { id: 'stale' }],
      error: null,
    });

    const ok = await pushBooks('user-1', [makeBook({ id: 'b1' })]);

    expect(ok).toBe(true);
    expect(tables.books.upsert).toHaveBeenCalledTimes(1);
    const [rows] = tables.books.upsert.mock.calls[0] as [Array<Record<string, unknown>>];
    expect(rows[0].id).toBe('b1');
    expect(rows[0].updated_at).toBeTruthy();
    expect(tables.books.deleteIn).toHaveBeenCalledWith('id', ['stale']);
  });

  it('skips the delete step when nothing is stale', async () => {
    tables.books.select.mockResolvedValueOnce({ data: [{ id: 'b1' }], error: null });

    const ok = await pushBooks('user-1', [makeBook({ id: 'b1' })]);

    expect(ok).toBe(true);
    expect(tables.books.deleteIn).not.toHaveBeenCalled();
  });

  it('skips the upsert entirely for an empty library but still prunes remote rows', async () => {
    tables.books.select.mockResolvedValueOnce({ data: [{ id: 'stale' }], error: null });

    const ok = await pushBooks('user-1', []);

    expect(ok).toBe(true);
    expect(tables.books.upsert).not.toHaveBeenCalled();
    expect(tables.books.deleteIn).toHaveBeenCalledWith('id', ['stale']);
  });

  it('returns false when the upsert fails', async () => {
    tables.books.upsert.mockResolvedValueOnce({ error: new Error('upsert boom') });

    const ok = await pushBooks('user-1', [makeBook()]);

    expect(ok).toBe(false);
    expect(captureException).toHaveBeenCalledOnce();
    // Short-circuits before fetching remote IDs.
    expect(tables.books.select).not.toHaveBeenCalled();
  });

  it('returns false when fetching remote IDs fails', async () => {
    tables.books.select.mockResolvedValueOnce({ data: null, error: { message: 'fetch boom' } });

    const ok = await pushBooks('user-1', [makeBook()]);

    expect(ok).toBe(false);
    expect(captureException).toHaveBeenCalledOnce();
    expect(tables.books.deleteIn).not.toHaveBeenCalled();
  });

  it('returns false when deleting stale rows fails', async () => {
    tables.books.select.mockResolvedValueOnce({ data: [{ id: 'stale' }], error: null });
    tables.books.deleteIn.mockResolvedValueOnce({ error: new Error('delete boom') });

    const ok = await pushBooks('user-1', [makeBook({ id: 'b1' })]);

    expect(ok).toBe(false);
    expect(captureException).toHaveBeenCalledOnce();
  });
});

describe('pushShelves', () => {
  it('upserts shelves and deletes stale remote shelves', async () => {
    tables.shelves.select.mockResolvedValueOnce({
      data: [{ id: 's1' }, { id: 'stale' }],
      error: null,
    });

    const ok = await pushShelves('user-1', [{ id: 's1', name: 'Fiction', color: '#f00' }]);

    expect(ok).toBe(true);
    expect(tables.shelves.upsert).toHaveBeenCalledTimes(1);
    expect(tables.shelves.deleteIn).toHaveBeenCalledWith('id', ['stale']);
  });

  it('returns false when the shelf upsert fails', async () => {
    tables.shelves.upsert.mockResolvedValueOnce({ error: new Error('shelf upsert boom') });

    const ok = await pushShelves('user-1', [{ id: 's1', name: 'Fiction', color: '#f00' }]);

    expect(ok).toBe(false);
    expect(captureException).toHaveBeenCalledOnce();
  });
});

describe('mergeSync', () => {
  it('returns null when the initial pull fails', async () => {
    tables.books.select.mockResolvedValueOnce({ data: null, error: { message: 'pull boom' } });

    await expect(mergeSync('user-1', [makeBook()])).resolves.toBeNull();
    expect(tables.books.upsert).not.toHaveBeenCalled();
    expect(saveSnapshot).not.toHaveBeenCalled();
  });

  it('merges remote-only books with local, snapshots, and reports no conflict', async () => {
    tables.books.select
      // pullBooks
      .mockResolvedValueOnce({ data: [makeRow('remote-1')], error: null })
      // pushBooks remote-ID fetch
      .mockResolvedValueOnce({ data: [{ id: 'remote-1' }], error: null });

    const local = [makeBook({ id: 'local-1' })];
    const result = await mergeSync('user-1', local);

    expect(result).not.toBeNull();
    expect(result!.books.map((b) => b.id).sort()).toEqual(['local-1', 'remote-1']);
    expect(saveSnapshot).toHaveBeenCalledWith(local);
    expect(setConflictBookIds).toHaveBeenCalledWith([]);
  });

  it('flags a conflict when the same book differs locally and remotely', async () => {
    tables.books.select
      .mockResolvedValueOnce({
        data: [makeRow('b1', { title: 'Remote Title' })],
        error: null,
      })
      .mockResolvedValueOnce({ data: [{ id: 'b1' }], error: null });

    const local = [makeBook({ id: 'b1', title: 'Local Title' })];
    const result = await mergeSync('user-1', local);

    expect(result).not.toBeNull();
    // Local wins the merge, but the conflict is recorded.
    expect(result!.books[0].title).toBe('Local Title');
    expect(setConflictBookIds).toHaveBeenCalledWith(['b1']);
  });

  it('returns null when the push fails after a successful pull', async () => {
    tables.books.select.mockResolvedValueOnce({ data: [makeRow('b1')], error: null });
    tables.books.upsert.mockResolvedValueOnce({ error: new Error('push boom') });

    await expect(mergeSync('user-1', [makeBook({ id: 'b2' })])).resolves.toBeNull();
    // Snapshot is taken before the push attempt so recovery is possible.
    expect(saveSnapshot).toHaveBeenCalled();
    expect(setConflictBookIds).not.toHaveBeenCalled();
  });

  it('merges shelves and still succeeds when there are no remote shelves', async () => {
    tables.books.select
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    tables.shelves.select
      // pullShelves fails → mergeSync falls back to local shelves only
      .mockResolvedValueOnce({ data: null, error: { message: 'shelves boom' } })
      // pushShelves remote-ID fetch
      .mockResolvedValueOnce({ data: [], error: null });

    const result = await mergeSync('user-1', [], [{ id: 's1', name: 'Fiction', color: '#f00' }]);

    expect(result).not.toBeNull();
    expect(result!.shelves).toEqual([{ id: 's1', name: 'Fiction', color: '#f00' }]);
  });
});
