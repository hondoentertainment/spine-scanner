import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookEntry, Shelf } from '../../types.ts';
import { mergeBooksLists, mergeShelvesLists, toBookEntry, toBookRow } from '../syncBooks';

type TableName = 'books' | 'shelves';

const { upsertErrors, fromMock } = vi.hoisted(() => {
  const remoteBooks = [{ id: 'remote-book', user_id: 'user-1', isbn: '9780000000002', title: 'Remote Book', author: 'Remote Author', page_count: 222, amazon_link: '', cover_img: '', status: 'read', notes: '', date_added: '2026-01-02T00:00:00.000Z', shelf_ids: [], updated_at: '2026-01-02T00:00:00.000Z' }];
  const remoteShelves = [{ id: 'remote-shelf', user_id: 'user-1', name: 'Remote Shelf', color: '#6366f1' }];
  const upsertErrors: Partial<Record<TableName, { message: string } | null>> = {};

  function makeQuery(table: TableName) {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: remoteBooks, error: null })),
          then: (resolve: (value: unknown) => unknown) => resolve({
            data: table === 'books'
              ? remoteBooks.map(({ id }) => ({ id }))
              : remoteShelves.map(({ id }) => ({ id })),
            error: null,
          }),
        })),
      })),
      upsert: vi.fn(() => Promise.resolve({ error: upsertErrors[table] ?? null })),
      delete: vi.fn(() => ({
        in: vi.fn(() => Promise.resolve({ error: null })),
      })),
    };
  }

  return {
    upsertErrors,
    fromMock: vi.fn((table: TableName) => makeQuery(table)),
  };
});

vi.mock('../supabase.ts', () => ({
  supabase: {
    from: fromMock,
  },
}));

vi.mock('../errorMonitoring.ts', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

const localBook: BookEntry = {
  id: 'local-book',
  isbn: '9780000000001',
  title: 'Local Book',
  author: 'Local Author',
  pageCount: 111,
  amazonLink: '',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: '2026-01-01T00:00:00.000Z',
  shelfIds: ['local-shelf'],
};

const localShelf: Shelf = {
  id: 'local-shelf',
  name: 'Local Shelf',
  color: '#22c55e',
};

describe('syncBooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertErrors.books = null;
    upsertErrors.shelves = null;
  });

  it('returns merged data when books and shelves both push successfully', async () => {
    const { mergeSync } = await import('../syncBooks.ts');

    const result = await mergeSync('user-1', [localBook], [localShelf]);

    expect(result?.books.map((book) => book.id)).toEqual(['remote-book', 'local-book']);
    expect(result?.shelves.map((shelf) => shelf.id)).toEqual(['remote-shelf', 'local-shelf']);
  });

  it('fails merge sync when shelf push fails after books push', async () => {
    const { mergeSync } = await import('../syncBooks.ts');
    upsertErrors.shelves = { message: 'shelf write failed' };

    await expect(mergeSync('user-1', [localBook], [localShelf])).resolves.toBeNull();
  });
});

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
    // b2 should have local title
    expect(result.find(b => b.id === 'b2')?.title).toBe('Local B2');
    // b3 from remote is included
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
});
