import { describe, it, expect } from 'vitest';
import { mergeBooksLists, mergeShelvesLists, toBookEntry, toBookRow } from '../syncBooks';
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

  it('local wins on conflict when timestamps are equal (same ID)', () => {
    const ts = '2026-01-15T00:00:00.000Z';
    const local = [makeBook({ id: 'b1', title: 'Local Title', updatedAt: ts })];
    const remote = [makeBook({ id: 'b1', title: 'Remote Title', updatedAt: ts })];
    const result = mergeBooksLists(local, remote);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Local Title');
  });

  it('newer updatedAt wins on conflict', () => {
    const local = [makeBook({ id: 'b1', title: 'Local Title', updatedAt: '2026-01-10T00:00:00.000Z' })];
    const remote = [makeBook({ id: 'b1', title: 'Remote Title', updatedAt: '2026-01-20T00:00:00.000Z' })];
    const result = mergeBooksLists(local, remote);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Remote Title');
  });

  it('falls back to local when both have no updatedAt', () => {
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
    // toBookRow now returns a full BookRow including updated_at
    const row = toBookRow(book, 'user-123');
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
      updated_at: '', rating: null, date_started: null, date_finished: null,
    };
    const entry = toBookEntry(row);
    expect(entry.shelfIds).toEqual([]);
  });

  it('round-trips rating and reading dates', () => {
    const book = makeBook({
      id: 'rt-2',
      rating: 4,
      dateStarted: '2026-01-01T00:00:00.000Z',
      dateFinished: '2026-01-20T00:00:00.000Z',
      updatedAt: '2026-01-20T12:00:00.000Z',
    });
    const row = toBookRow(book, 'user-1');
    expect(row.rating).toBe(4);
    expect(row.date_started).toBe('2026-01-01T00:00:00.000Z');
    expect(row.date_finished).toBe('2026-01-20T00:00:00.000Z');
    expect(row.updated_at).toBe('2026-01-20T12:00:00.000Z');

    const restored = toBookEntry(row);
    expect(restored.rating).toBe(4);
    expect(restored.dateStarted).toBe('2026-01-01T00:00:00.000Z');
    expect(restored.dateFinished).toBe('2026-01-20T00:00:00.000Z');
    expect(restored.updatedAt).toBe('2026-01-20T12:00:00.000Z');
  });
});
