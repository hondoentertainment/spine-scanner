import { describe, it, expect, beforeEach } from 'vitest';
import { useBookStore } from '../useBookStore';
import type { BookEntry } from '../../types';
import type { Shelf } from '../../types';

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'test-1',
  isbn: '9780141036144',
  title: 'Test Book',
  author: 'Test Author',
  pageCount: 200,
  amazonLink: 'https://amazon.com',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: new Date().toISOString(),
  shelfIds: [],
  ...overrides,
});

const makeShelf = (overrides: Partial<Shelf> = {}): Shelf => ({
  id: 'shelf-1',
  name: 'Fiction',
  color: '#6366f1',
  ...overrides,
});

describe('useBookStore', () => {
  beforeEach(() => {
    // Reset store state between tests
    useBookStore.setState({ books: [], shelves: [] });
  });

  it('starts with empty books array', () => {
    expect(useBookStore.getState().books).toEqual([]);
  });

  it('adds a book', () => {
    const book = makeBook();
    useBookStore.getState().addBook(book);
    expect(useBookStore.getState().books).toHaveLength(1);
    expect(useBookStore.getState().books[0].title).toBe('Test Book');
  });

  it('prepends new books (most recent first)', () => {
    useBookStore.getState().addBook(makeBook({ id: '1', title: 'First' }));
    useBookStore.getState().addBook(makeBook({ id: '2', title: 'Second' }));
    expect(useBookStore.getState().books[0].title).toBe('Second');
    expect(useBookStore.getState().books[1].title).toBe('First');
  });

  it('removes a book by id', () => {
    useBookStore.getState().addBook(makeBook({ id: '1' }));
    useBookStore.getState().addBook(makeBook({ id: '2' }));
    useBookStore.getState().removeBook('1');
    expect(useBookStore.getState().books).toHaveLength(1);
    expect(useBookStore.getState().books[0].id).toBe('2');
  });

  it('updates book status', () => {
    useBookStore.getState().addBook(makeBook({ id: '1', status: 'to-read' }));
    useBookStore.getState().updateBookStatus('1', 'reading');
    expect(useBookStore.getState().books[0].status).toBe('reading');
  });

  it('updates book notes', () => {
    useBookStore.getState().addBook(makeBook({ id: '1', notes: '' }));
    useBookStore.getState().updateBookNotes('1', 'Great book!');
    expect(useBookStore.getState().books[0].notes).toBe('Great book!');
  });

  it('updates reading progress and moves a book into reading', () => {
    useBookStore.getState().addBook(makeBook({ id: '1', status: 'to-read', pagesFinished: 0 }));
    useBookStore.getState().updateReadingProgress('1', 25);
    const book = useBookStore.getState().books[0];
    expect(book.pagesFinished).toBe(25);
    expect(book.status).toBe('reading');
  });

  it('can explicitly resolve a review flag', () => {
    useBookStore.getState().addBook(makeBook({ id: '1', needsReview: true, reviewReason: 'Missing metadata' }));
    useBookStore.getState().markNeedsReview('1', false);
    const book = useBookStore.getState().books[0];
    expect(book.needsReview).toBe(false);
    expect(book.reviewReason).toBe('');
  });

  it('does not affect other books when updating', () => {
    useBookStore.getState().addBook(makeBook({ id: '1', title: 'Book 1' }));
    useBookStore.getState().addBook(makeBook({ id: '2', title: 'Book 2' }));
    useBookStore.getState().updateBookStatus('1', 'read');
    expect(useBookStore.getState().books.find(b => b.id === '2')?.status).toBe('to-read');
  });

  // ─── updateBook (generic partial update) ─────────────────────
  it('updates a book with partial fields', () => {
    useBookStore.getState().addBook(makeBook({ id: '1', title: 'Old Title', author: 'Old Author' }));
    useBookStore.getState().updateBook('1', { title: 'New Title', pageCount: 999 });
    const book = useBookStore.getState().books[0];
    expect(book.title).toBe('New Title');
    expect(book.pageCount).toBe(999);
    expect(book.author).toBe('Old Author'); // unchanged
  });

  it('updateBook does not affect other books', () => {
    useBookStore.getState().addBook(makeBook({ id: '1', title: 'Book 1' }));
    useBookStore.getState().addBook(makeBook({ id: '2', title: 'Book 2' }));
    useBookStore.getState().updateBook('1', { title: 'Updated' });
    expect(useBookStore.getState().books.find(b => b.id === '2')?.title).toBe('Book 2');
  });

  // ─── setBooks (bulk replace) ──────────────────────────────────
  it('setBooks replaces the entire books array', () => {
    useBookStore.getState().addBook(makeBook({ id: '1' }));
    useBookStore.getState().addBook(makeBook({ id: '2' }));
    const replacement = [makeBook({ id: '3', title: 'Replacement' })];
    useBookStore.getState().setBooks(replacement);
    expect(useBookStore.getState().books).toHaveLength(1);
    expect(useBookStore.getState().books[0].id).toBe('3');
  });

  // ─── Shelf CRUD ───────────────────────────────────────────────
  it('starts with empty shelves array', () => {
    expect(useBookStore.getState().shelves).toEqual([]);
  });

  it('adds a shelf', () => {
    useBookStore.getState().addShelf(makeShelf());
    expect(useBookStore.getState().shelves).toHaveLength(1);
    expect(useBookStore.getState().shelves[0].name).toBe('Fiction');
  });

  it('updates a shelf', () => {
    useBookStore.getState().addShelf(makeShelf({ id: 's1', name: 'Old Name' }));
    useBookStore.getState().updateShelf('s1', { name: 'New Name' });
    expect(useBookStore.getState().shelves[0].name).toBe('New Name');
  });

  it('removes a shelf', () => {
    useBookStore.getState().addShelf(makeShelf({ id: 's1' }));
    useBookStore.getState().addShelf(makeShelf({ id: 's2', name: 'Other' }));
    useBookStore.getState().removeShelf('s1');
    expect(useBookStore.getState().shelves).toHaveLength(1);
    expect(useBookStore.getState().shelves[0].id).toBe('s2');
  });

  it('removing a shelf also unassigns it from all books', () => {
    useBookStore.getState().addShelf(makeShelf({ id: 's1' }));
    useBookStore.getState().addBook(makeBook({ id: 'b1', shelfIds: ['s1', 's2'] }));
    useBookStore.getState().addBook(makeBook({ id: 'b2', shelfIds: ['s1'] }));
    useBookStore.getState().removeShelf('s1');
    expect(useBookStore.getState().books.find(b => b.id === 'b1')?.shelfIds).toEqual(['s2']);
    expect(useBookStore.getState().books.find(b => b.id === 'b2')?.shelfIds).toEqual([]);
  });

  it('setShelves replaces the entire shelves array', () => {
    useBookStore.getState().addShelf(makeShelf({ id: 's1' }));
    const replacement = [makeShelf({ id: 's2', name: 'New Shelf' })];
    useBookStore.getState().setShelves(replacement);
    expect(useBookStore.getState().shelves).toHaveLength(1);
    expect(useBookStore.getState().shelves[0].id).toBe('s2');
  });

  // ─── Shelf assignment ─────────────────────────────────────────
  it('assigns a shelf to a book', () => {
    useBookStore.getState().addBook(makeBook({ id: 'b1', shelfIds: [] }));
    useBookStore.getState().assignShelf('b1', 's1');
    expect(useBookStore.getState().books[0].shelfIds).toEqual(['s1']);
  });

  it('does not double-assign the same shelf', () => {
    useBookStore.getState().addBook(makeBook({ id: 'b1', shelfIds: ['s1'] }));
    useBookStore.getState().assignShelf('b1', 's1');
    expect(useBookStore.getState().books[0].shelfIds).toEqual(['s1']);
  });

  it('unassigns a shelf from a book', () => {
    useBookStore.getState().addBook(makeBook({ id: 'b1', shelfIds: ['s1', 's2'] }));
    useBookStore.getState().unassignShelf('b1', 's1');
    expect(useBookStore.getState().books[0].shelfIds).toEqual(['s2']);
  });

  it('unassigning a non-existent shelf is a no-op', () => {
    useBookStore.getState().addBook(makeBook({ id: 'b1', shelfIds: ['s1'] }));
    useBookStore.getState().unassignShelf('b1', 'nonexistent');
    expect(useBookStore.getState().books[0].shelfIds).toEqual(['s1']);
  });
});
