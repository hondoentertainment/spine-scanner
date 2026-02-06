import { describe, it, expect, beforeEach } from 'vitest';
import { useBookStore } from '../useBookStore';
import type { BookEntry } from '../../types';

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
  ...overrides,
});

describe('useBookStore', () => {
  beforeEach(() => {
    // Reset store state between tests
    useBookStore.setState({ books: [] });
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

  it('does not affect other books when updating', () => {
    useBookStore.getState().addBook(makeBook({ id: '1', title: 'Book 1' }));
    useBookStore.getState().addBook(makeBook({ id: '2', title: 'Book 2' }));
    useBookStore.getState().updateBookStatus('1', 'read');
    expect(useBookStore.getState().books.find(b => b.id === '2')?.status).toBe('to-read');
  });
});
