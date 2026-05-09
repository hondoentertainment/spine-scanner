import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BookEntry, Shelf } from '../../types';

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

const makeShelf = (overrides: Partial<Shelf> = {}): Shelf => ({
  id: 's1',
  name: 'Fiction',
  color: '#6366f1',
  ...overrides,
});

// ─── mergeBooksLists ────────────────────────────────────────────

describe('mergeBooksLists', () => {
  let mergeBooksLists: (l: BookEntry[], r: BookEntry[]) => BookEntry[];
  beforeEach(async () => {
    vi.doMock('../../lib/supabase', () => ({ supabase: null }));
    const mod = await import('../syncBooks');
    mergeBooksLists = mod.mergeBooksLists;
  });
  afterEach(() => vi.resetModules());

  it('returns empty array when both lists are empty', () => {
    expect(mergeBooksLists([], [])).toEqual([]);
  });

  it('returns local books when remote is empty', () => {
    const local = [makeBook({ id: 'b1' })];
    const result = mergeBooksLists(local, []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b1');
  });

  it('returns remote books when local is empty', () => {
    const remote = [makeBook({ id: 'b1' })];
    const result = mergeBooksLists([], remote);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b1');
  });

  it('merges unique books from both lists', () => {
    const local = [makeBook({ id: 'b1', dateAdded: '2026-01-01T00:00:00.000Z' })];
    const remote = [makeBook({ id: 'b2', dateAdded: '2026-01-02T00:00:00.000Z' })];
    const result = mergeBooksLists(local, remote);
    expect(result).toHaveLength(2);
    expect(result.map(b => b.id)).toContain('b1');
    expect(result.map(b => b.id)).toContain('b2');
  });

  it('local wins on conflict (same ID)', () => {
    const local = [makeBook({ id: 'b1', title: 'Local Title' })];
    const remote = [makeBook({ id: 'b1', title: 'Remote Title' })];
    const result = mergeBooksLists(local, remote);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Local Title');
  });

  it('sorts merged result by dateAdded descending', () => {
    const local = [makeBook({ id: 'b1', dateAdded: '2026-01-01T00:00:00.000Z' })];
    const remote = [makeBook({ id: 'b2', dateAdded: '2026-02-01T00:00:00.000Z' })];
    const result = mergeBooksLists(local, remote);
    expect(result[0].id).toBe('b2');
    expect(result[1].id).toBe('b1');
  });

  it('handles multiple books with overlapping IDs', () => {
    const local = [
      makeBook({ id: 'b1', title: 'Local B1', dateAdded: '2026-01-01T00:00:00.000Z' }),
      makeBook({ id: 'b2', title: 'Local B2', dateAdded: '2026-01-02T00:00:00.000Z' }),
    ];
    const remote = [
      makeBook({ id: 'b2', title: 'Remote B2', dateAdded: '2026-01-02T00:00:00.000Z' }),
      makeBook({ id: 'b3', title: 'Remote B3', dateAdded: '2026-01-03T00:00:00.000Z' }),
    ];
    const result = mergeBooksLists(local, remote);
    expect(result).toHaveLength(3);
    expect(result.find(b => b.id === 'b2')?.title).toBe('Local B2');
    expect(result.find(b => b.id === 'b3')?.title).toBe('Remote B3');
  });

  it('preserves shelfIds during merge', () => {
    const local = [makeBook({ id: 'b1', shelfIds: ['s1', 's2'] })];
    const remote = [makeBook({ id: 'b2', shelfIds: ['s3'] })];
    const result = mergeBooksLists(local, remote);
    expect(result.find(b => b.id === 'b1')?.shelfIds).toEqual(['s1', 's2']);
    expect(result.find(b => b.id === 'b2')?.shelfIds).toEqual(['s3']);
  });
});

// ─── mergeShelvesLists ──────────────────────────────────────────

describe('mergeShelvesLists', () => {
  let mergeShelvesLists: (l: Shelf[], r: Shelf[]) => Shelf[];
  beforeEach(async () => {
    vi.doMock('../../lib/supabase', () => ({ supabase: null }));
    const mod = await import('../syncBooks');
    mergeShelvesLists = mod.mergeShelvesLists;
  });
  afterEach(() => vi.resetModules());

  it('returns empty array when both lists are empty', () => {
    expect(mergeShelvesLists([], [])).toEqual([]);
  });

  it('returns local shelves when remote is empty', () => {
    const local = [makeShelf({ id: 's1' })];
    const result = mergeShelvesLists(local, []);
    expect(result).toHaveLength(1);
  });

  it('returns remote shelves when local is empty', () => {
    const remote = [makeShelf({ id: 's1' })];
    const result = mergeShelvesLists([], remote);
    expect(result).toHaveLength(1);
  });

  it('merges unique shelves from both lists', () => {
    const local = [makeShelf({ id: 's1', name: 'Fiction' })];
    const remote = [makeShelf({ id: 's2', name: 'Non-Fiction' })];
    const result = mergeShelvesLists(local, remote);
    expect(result).toHaveLength(2);
  });

  it('local wins on conflict (same ID)', () => {
    const local = [makeShelf({ id: 's1', name: 'Local Name', color: '#ff0000' })];
    const remote = [makeShelf({ id: 's1', name: 'Remote Name', color: '#00ff00' })];
    const result = mergeShelvesLists(local, remote);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Local Name');
    expect(result[0].color).toBe('#ff0000');
  });
});

// ─── Converter round-trip ───────────────────────────────────────

describe('toBookEntry / toBookRow', () => {
  let toBookEntry: ReturnType<typeof import('../syncBooks')>['toBookEntry'];
  let toBookRow: ReturnType<typeof import('../syncBooks')>['toBookRow'];
  beforeEach(async () => {
    vi.doMock('../../lib/supabase', () => ({ supabase: null }));
    const mod = await import('../syncBooks');
    toBookEntry = mod.toBookEntry;
    toBookRow = mod.toBookRow;
  });
  afterEach(() => vi.resetModules());

  it('round-trips a book through row conversion', () => {
    const book = makeBook({ id: 'rt-1', shelfIds: ['s1', 's2'] });
    const row = { ...toBookRow(book, 'user-123'), updated_at: new Date().toISOString() };
    const restored = toBookEntry(row);

    expect(restored.id).toBe(book.id);
    expect(restored.isbn).toBe(book.isbn);
    expect(restored.title).toBe(book.title);
    expect(restored.author).toBe(book.author);
    expect(restored.pageCount).toBe(book.pageCount);
    expect(restored.status).toBe(book.status);
    expect(restored.shelfIds).toEqual(book.shelfIds);
  });

  it('toBookRow includes user_id', () => {
    const row = toBookRow(makeBook(), 'user-456');
    expect(row.user_id).toBe('user-456');
  });

  it('toBookEntry defaults shelfIds to empty array when null', () => {
    const row = {
      id: 'x', user_id: 'u', isbn: '', title: '', author: '',
      page_count: 0, amazon_link: '', cover_img: '', status: 'to-read',
      notes: '', date_added: '', shelf_ids: null as unknown as string[],
      updated_at: '',
    };
    const entry = toBookEntry(row);
    expect(entry.shelfIds).toEqual([]);
  });

  it('toBookEntry defaults optional reading fields to null/0 when absent', () => {
    const row = {
      id: 'y', user_id: 'u', isbn: '123', title: 'T', author: 'A',
      page_count: 100, amazon_link: '', cover_img: '', status: 'read',
      notes: '', date_added: '2026-01-01', shelf_ids: [],
      updated_at: '', is_photo_only: undefined, needs_review: undefined,
      review_reason: undefined, pages_finished: undefined,
      started_at: undefined, finished_at: undefined, last_progress_at: undefined,
    };
    const entry = toBookEntry(row);
    expect(entry.isPhotoOnly).toBe(false);
    expect(entry.needsReview).toBe(false);
    expect(entry.reviewReason).toBe('');
    expect(entry.pagesFinished).toBe(0);
    expect(entry.startedAt).toBeNull();
    expect(entry.finishedAt).toBeNull();
    expect(entry.lastProgressAt).toBeNull();
  });

  it('toBookRow defaults optional fields to null/false when absent', () => {
    const book = makeBook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bookWithUndefined: BookEntry = { ...book, isPhotoOnly: undefined as any, needsReview: undefined as any, reviewReason: undefined as any, pagesFinished: undefined as any, startedAt: undefined as any, finishedAt: undefined as any, lastProgressAt: undefined as any };
    const row = toBookRow(bookWithUndefined, 'u');
    expect(row.is_photo_only).toBe(false);
    expect(row.needs_review).toBe(false);
    expect(row.review_reason).toBe('');
    expect(row.pages_finished).toBe(0);
    expect(row.started_at).toBeNull();
    expect(row.finished_at).toBeNull();
    expect(row.last_progress_at).toBeNull();
  });
});

// ─── pullBooks ──────────────────────────────────────────────────

describe('pullBooks', () => {
  afterEach(() => vi.resetModules());

  it('returns null when supabase is not configured', async () => {
    vi.doMock('../../lib/supabase', () => ({ supabase: null }));
    vi.doMock('../../lib/errorMonitoring', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
    const { pullBooks } = await import('../syncBooks');

    const result = await pullBooks('user-1');
    expect(result).toBeNull();
  });

  it('returns null and logs on supabase error', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
      }),
    };
    vi.doMock('../../lib/supabase', () => ({ supabase: mockSupabase }));
    vi.doMock('../../lib/errorMonitoring', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
    const { pullBooks } = await import('../syncBooks');

    const result = await pullBooks('user-1');
    expect(result).toBeNull();
  });

  it('returns mapped book entries on success', async () => {
    const fakeRow = {
      id: 'b1', user_id: 'u', isbn: '123', title: 'T', author: 'A',
      page_count: 10, amazon_link: '', cover_img: '', status: 'to-read',
      notes: '', date_added: '2026-01-01', shelf_ids: [], updated_at: '',
    };
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [fakeRow], error: null }),
      }),
    };
    vi.doMock('../../lib/supabase', () => ({ supabase: mockSupabase }));
    vi.doMock('../../lib/errorMonitoring', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
    const { pullBooks } = await import('../syncBooks');

    const result = await pullBooks('user-1');
    expect(result).toHaveLength(1);
    expect(result![0].id).toBe('b1');
  });
});

// ─── pullShelves ────────────────────────────────────────────────

describe('pullShelves', () => {
  afterEach(() => vi.resetModules());

  it('returns null when supabase is not configured', async () => {
    vi.doMock('../../lib/supabase', () => ({ supabase: null }));
    vi.doMock('../../lib/errorMonitoring', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
    const { pullShelves } = await import('../syncBooks');

    const result = await pullShelves('user-1');
    expect(result).toBeNull();
  });

  it('returns null on supabase error', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'error' } }),
      }),
    };
    vi.doMock('../../lib/supabase', () => ({ supabase: mockSupabase }));
    vi.doMock('../../lib/errorMonitoring', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
    const { pullShelves } = await import('../syncBooks');

    const result = await pullShelves('user-1');
    expect(result).toBeNull();
  });

  it('returns mapped shelves on success', async () => {
    const fakeShelf = { id: 's1', user_id: 'u', name: 'Fiction', color: '#fff' };
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [fakeShelf], error: null }),
      }),
    };
    vi.doMock('../../lib/supabase', () => ({ supabase: mockSupabase }));
    vi.doMock('../../lib/errorMonitoring', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
    const { pullShelves } = await import('../syncBooks');

    const result = await pullShelves('user-1');
    expect(result).toHaveLength(1);
    expect(result![0].id).toBe('s1');
  });
});

// ─── pushBooks ──────────────────────────────────────────────────

describe('pushBooks', () => {
  afterEach(() => vi.resetModules());

  it('returns false when supabase is not configured', async () => {
    vi.doMock('../../lib/supabase', () => ({ supabase: null }));
    vi.doMock('../../lib/errorMonitoring', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
    const { pushBooks } = await import('../syncBooks');

    const result = await pushBooks('user-1', [makeBook()]);
    expect(result).toBe(false);
  });

  it('skips upsert when books array is empty and deletes nothing when no stale IDs', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    const mockSupabase = { from: mockFrom };
    vi.doMock('../../lib/supabase', () => ({ supabase: mockSupabase }));
    vi.doMock('../../lib/errorMonitoring', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
    const { pushBooks } = await import('../syncBooks');

    const result = await pushBooks('user-1', []);
    expect(result).toBe(true);
  });

  it('returns false on upsert error', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: { message: 'upsert error' } }),
    });
    const mockSupabase = { from: mockFrom };
    vi.doMock('../../lib/supabase', () => ({ supabase: mockSupabase }));
    vi.doMock('../../lib/errorMonitoring', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
    const { pushBooks } = await import('../syncBooks');

    const result = await pushBooks('user-1', [makeBook()]);
    expect(result).toBe(false);
  });

  it('returns false on fetch remote IDs error', async () => {
    let callCount = 0;
    const mockFrom = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call: upsert succeeds
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }
      // Second call: select remote IDs fails
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'fetch error' } }),
      };
    });
    const mockSupabase = { from: mockFrom };
    vi.doMock('../../lib/supabase', () => ({ supabase: mockSupabase }));
    vi.doMock('../../lib/errorMonitoring', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
    const { pushBooks } = await import('../syncBooks');

    const result = await pushBooks('user-1', [makeBook({ id: 'b1' })]);
    expect(result).toBe(false);
  });

  it('deletes stale books and returns true on success', async () => {
    const deleteMock = vi.fn().mockReturnThis();
    const inMock = vi.fn().mockResolvedValue({ error: null });
    let callCount = 0;
    const mockFrom = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }
      // Remote has b1 + b2; local only has b1 → b2 is stale
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [{ id: 'b1' }, { id: 'b2' }], error: null }),
        delete: deleteMock,
        in: inMock,
      };
    });
    // deleteMock chain: .delete().in(...)
    deleteMock.mockReturnValue({ in: inMock });

    const mockSupabase = { from: mockFrom };
    vi.doMock('../../lib/supabase', () => ({ supabase: mockSupabase }));
    vi.doMock('../../lib/errorMonitoring', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
    const { pushBooks } = await import('../syncBooks');

    const result = await pushBooks('user-1', [makeBook({ id: 'b1' })]);
    expect(result).toBe(true);
  });

  it('returns false on delete stale error', async () => {
    const inMock = vi.fn().mockResolvedValue({ error: { message: 'delete error' } });
    const deleteMock = vi.fn().mockReturnValue({ in: inMock });
    let callCount = 0;
    const mockFrom = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [{ id: 'b1' }, { id: 'stale' }], error: null }),
        delete: deleteMock,
      };
    });
    const mockSupabase = { from: mockFrom };
    vi.doMock('../../lib/supabase', () => ({ supabase: mockSupabase }));
    vi.doMock('../../lib/errorMonitoring', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
    const { pushBooks } = await import('../syncBooks');

    const result = await pushBooks('user-1', [makeBook({ id: 'b1' })]);
    expect(result).toBe(false);
  });
});

// ─── pushShelves ────────────────────────────────────────────────

describe('pushShelves', () => {
  afterEach(() => vi.resetModules());

  it('returns false when supabase is not configured', async () => {
    vi.doMock('../../lib/supabase', () => ({ supabase: null }));
    vi.doMock('../../lib/errorMonitoring', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
    const { pushShelves } = await import('../syncBooks');

    const result = await pushShelves('user-1', [makeShelf()]);
    expect(result).toBe(false);
  });

  it('returns false on upsert error', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: { message: 'upsert fail' } }),
    });
    vi.doMock('../../lib/supabase', () => ({ supabase: { from: mockFrom } }));
    vi.doMock('../../lib/errorMonitoring', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
    const { pushShelves } = await import('../syncBooks');

    const result = await pushShelves('user-1', [makeShelf()]);
    expect(result).toBe(false);
  });

  it('skips upsert and delete when shelves is empty and remote is empty', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    vi.doMock('../../lib/supabase', () => ({ supabase: { from: mockFrom } }));
    vi.doMock('../../lib/errorMonitoring', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
    const { pushShelves } = await import('../syncBooks');

    const result = await pushShelves('user-1', []);
    expect(result).toBe(true);
  });

  it('returns false on fetch remote shelf IDs error', async () => {
    let callCount = 0;
    const mockFrom = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'fetch error' } }),
      };
    });
    vi.doMock('../../lib/supabase', () => ({ supabase: { from: mockFrom } }));
    vi.doMock('../../lib/errorMonitoring', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
    const { pushShelves } = await import('../syncBooks');

    const result = await pushShelves('user-1', [makeShelf()]);
    expect(result).toBe(false);
  });

  it('deletes stale shelves and returns true', async () => {
    const inMock = vi.fn().mockResolvedValue({ error: null });
    const deleteMock = vi.fn().mockReturnValue({ in: inMock });
    let callCount = 0;
    const mockFrom = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [{ id: 's1' }, { id: 'stale' }], error: null }),
        delete: deleteMock,
      };
    });
    vi.doMock('../../lib/supabase', () => ({ supabase: { from: mockFrom } }));
    vi.doMock('../../lib/errorMonitoring', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
    const { pushShelves } = await import('../syncBooks');

    const result = await pushShelves('user-1', [makeShelf({ id: 's1' })]);
    expect(result).toBe(true);
  });

  it('returns false on delete stale shelves error', async () => {
    const inMock = vi.fn().mockResolvedValue({ error: { message: 'delete error' } });
    const deleteMock = vi.fn().mockReturnValue({ in: inMock });
    let callCount = 0;
    const mockFrom = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [{ id: 's1' }, { id: 'stale' }], error: null }),
        delete: deleteMock,
      };
    });
    vi.doMock('../../lib/supabase', () => ({ supabase: { from: mockFrom } }));
    vi.doMock('../../lib/errorMonitoring', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
    const { pushShelves } = await import('../syncBooks');

    const result = await pushShelves('user-1', [makeShelf({ id: 's1' })]);
    expect(result).toBe(false);
  });
});

// ─── mergeSync ──────────────────────────────────────────────────

describe('mergeSync', () => {
  afterEach(() => vi.resetModules());

  it('returns null when supabase is not configured', async () => {
    vi.doMock('../../lib/supabase', () => ({ supabase: null }));
    vi.doMock('../../lib/errorMonitoring', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
    const { mergeSync } = await import('../syncBooks');

    const result = await mergeSync('user-1', []);
    expect(result).toBeNull();
  });

  it('returns null when pullBooks fails', async () => {
    // pullBooks calls from('books').select().eq().order()
    let callIdx = 0;
    const mockFrom = vi.fn().mockImplementation(() => {
      callIdx++;
      if (callIdx === 1) {
        // pullBooks → error
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: null, error: { message: 'pull error' } }),
        };
      }
      return {};
    });
    vi.doMock('../../lib/supabase', () => ({ supabase: { from: mockFrom } }));
    vi.doMock('../../lib/errorMonitoring', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
    const { mergeSync } = await import('../syncBooks');

    const result = await mergeSync('user-1', [makeBook()]);
    expect(result).toBeNull();
  });

  it('returns null when pushBooks fails', async () => {
    let callIdx = 0;
    const mockFrom = vi.fn().mockImplementation(() => {
      callIdx++;
      if (callIdx === 1) {
        // pullBooks → success (empty remote books)
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (callIdx === 2) {
        // pullShelves → success (empty)
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (callIdx === 3) {
        // pushBooks upsert → error
        return {
          upsert: vi.fn().mockResolvedValue({ error: { message: 'push error' } }),
        };
      }
      return {};
    });
    vi.doMock('../../lib/supabase', () => ({ supabase: { from: mockFrom } }));
    vi.doMock('../../lib/errorMonitoring', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
    const { mergeSync } = await import('../syncBooks');

    const result = await mergeSync('user-1', [makeBook()]);
    expect(result).toBeNull();
  });

  it('returns merged books and shelves on full success', async () => {
    const fakeBook = {
      id: 'b1', user_id: 'u', isbn: '123', title: 'T', author: 'A',
      page_count: 10, amazon_link: '', cover_img: '', status: 'to-read',
      notes: '', date_added: '2026-01-01', shelf_ids: [], updated_at: '',
    };
    let callIdx = 0;
    const mockFrom = vi.fn().mockImplementation(() => {
      callIdx++;
      if (callIdx === 1) {
        // pullBooks
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [fakeBook], error: null }),
        };
      }
      if (callIdx === 2) {
        // pullShelves
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (callIdx === 3) {
        // pushBooks upsert
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (callIdx === 4) {
        // pushBooks fetch remote IDs
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [{ id: 'b1' }], error: null }),
        };
      }
      // pushShelves (empty, no upsert) + fetch remote shelf IDs
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });
    vi.doMock('../../lib/supabase', () => ({ supabase: { from: mockFrom } }));
    vi.doMock('../../lib/errorMonitoring', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
    const { mergeSync } = await import('../syncBooks');

    const result = await mergeSync('user-1', []);
    expect(result).not.toBeNull();
    expect(result!.books).toHaveLength(1);
    expect(result!.shelves).toHaveLength(0);
  });
});
