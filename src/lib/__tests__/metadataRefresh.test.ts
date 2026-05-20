import { describe, it, expect } from 'vitest';
import { applyMetadataRefresh } from '../metadataRefresh.ts';
import type { BookEntry, BookLookupResult } from '../../types.ts';

const baseBook = (): BookEntry => ({
  id: 'b1',
  isbn: '9780141036144',
  title: 'Old',
  author: 'Old Author',
  pageCount: 10,
  amazonLink: 'https://www.amazon.com/s?k=9780141036144',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: new Date().toISOString(),
  shelfIds: [],
});

describe('applyMetadataRefresh', () => {
  it('overwrites fields when nothing is user-edited', () => {
    const lookup: BookLookupResult = {
      title: 'New Title',
      authors: ['A'],
      pageCount: 99,
      thumbnail: 'https://covers.example/thumb.jpg',
      isbn: '9780141036144',
      metadataSource: 'google_books',
      google: null,
      openLibrary: null,
    };
    const u = applyMetadataRefresh(baseBook(), lookup);
    expect(u.title).toBe('New Title');
    expect(u.author).toBe('A');
    expect(u.pageCount).toBe(99);
    expect(u.coverImg).toBe('https://covers.example/thumb.jpg');
    expect(u.metadataSource).toBe('google_books');
  });

  it('skips user-edited fields', () => {
    const book = {
      ...baseBook(),
      metadataUserEdited: { title: true, author: true, pageCount: true, coverImg: true },
    };
    const lookup: BookLookupResult = {
      title: 'New Title',
      authors: ['A'],
      pageCount: 99,
      thumbnail: 'https://x',
      isbn: '9780141036144',
      metadataSource: 'open_library',
      google: null,
      openLibrary: null,
    };
    const u = applyMetadataRefresh(book, lookup);
    expect(u.title).toBeUndefined();
    expect(u.author).toBeUndefined();
    expect(u.pageCount).toBeUndefined();
    expect(u.coverImg).toBeUndefined();
    expect(u.metadataSource).toBe('open_library');
  });
});
