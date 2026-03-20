import { describe, it, expect, beforeEach } from 'vitest';
import { useBookStore } from '../useBookStore';
import type { BookEntry } from '../../types';

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'meta-1',
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

describe('Metadata Quality Fields', () => {
  beforeEach(() => {
    useBookStore.setState({ books: [], shelves: [] });
  });

  it('stores metadataSource on a book', () => {
    const book = makeBook({ metadataSource: 'google_books' });
    useBookStore.getState().addBook(book);
    expect(useBookStore.getState().books[0].metadataSource).toBe('google_books');
  });

  it('stores userEditedFields on a book', () => {
    const book = makeBook({ userEditedFields: ['title', 'author'] });
    useBookStore.getState().addBook(book);
    expect(useBookStore.getState().books[0].userEditedFields).toEqual(['title', 'author']);
  });

  it('defaults metadataSource to undefined for legacy books', () => {
    const book = makeBook();
    useBookStore.getState().addBook(book);
    expect(useBookStore.getState().books[0].metadataSource).toBeUndefined();
  });

  it('updates metadataSource via updateBook', () => {
    const book = makeBook({ metadataSource: 'google_books' });
    useBookStore.getState().addBook(book);
    useBookStore.getState().updateBook('meta-1', { metadataSource: 'manual' });
    expect(useBookStore.getState().books[0].metadataSource).toBe('manual');
  });

  it('updates userEditedFields via updateBook', () => {
    const book = makeBook({ userEditedFields: [] });
    useBookStore.getState().addBook(book);
    useBookStore.getState().updateBook('meta-1', { userEditedFields: ['title', 'pageCount'] });
    expect(useBookStore.getState().books[0].userEditedFields).toEqual(['title', 'pageCount']);
  });

  it('preserves metadataSource when updating other fields', () => {
    const book = makeBook({ metadataSource: 'open_library' });
    useBookStore.getState().addBook(book);
    useBookStore.getState().updateBook('meta-1', { title: 'New Title' });
    expect(useBookStore.getState().books[0].metadataSource).toBe('open_library');
    expect(useBookStore.getState().books[0].title).toBe('New Title');
  });

  it('tracks manual edits by accumulating userEditedFields', () => {
    const book = makeBook({ userEditedFields: ['title'] });
    useBookStore.getState().addBook(book);
    // Simulate user editing more fields
    useBookStore.getState().updateBook('meta-1', {
      author: 'New Author',
      userEditedFields: ['title', 'author'],
    });
    expect(useBookStore.getState().books[0].userEditedFields).toEqual(['title', 'author']);
  });

  it('stores import as metadataSource', () => {
    const book = makeBook({ metadataSource: 'import' });
    useBookStore.getState().addBook(book);
    expect(useBookStore.getState().books[0].metadataSource).toBe('import');
  });
});
