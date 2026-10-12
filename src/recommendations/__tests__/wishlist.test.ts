import { describe, expect, it } from 'vitest';
import { isValidIsbn } from '../../utils/isbnValidation.ts';
import { toWishlistBook } from '../wishlist.ts';
import type { BookRecommendation } from '../types.ts';

const recommendation = (overrides: Partial<BookRecommendation> = {}): BookRecommendation => ({
  id: 'isbn:9780441013593',
  title: 'Dune Messiah',
  author: 'Frank Herbert',
  isbn: '9780441013593',
  isbns: ['9780441013593'],
  pageCount: 336,
  coverImg: 'https://covers.openlibrary.org/b/id/1-M.jpg',
  reason: 'Because you own Dune',
  becauseTitles: ['Dune'],
  source: 'open_library',
  seriesName: 'Dune',
  ...overrides,
});

describe('toWishlistBook', () => {
  it('adds the suggestion to the to-read list in one step', () => {
    const book = toWishlistBook(recommendation(), new Date('2026-04-01T00:00:00.000Z'));
    expect(book.status).toBe('to-read');
    expect(book.title).toBe('Dune Messiah');
    expect(book.isbn).toBe('9780441013593');
    expect(isValidIsbn(book.isbn)).toBe(true);
    expect(book.notes).toBe('Because you own Dune');
    expect(book.seriesName).toBe('Dune');
    expect(book.metadataSource).toBe('open_library');
    expect(book.needsReview).toBe(false);
    expect(book.amazonLink).toContain('9780441013593');
    expect(book.dateAdded).toBe('2026-04-01T00:00:00.000Z');
  });

  it('still saves a suggestion that has no ISBN', () => {
    const book = toWishlistBook(recommendation({ isbn: '', isbns: [], source: 'llm' }));
    expect(book.status).toBe('to-read');
    expect(book.isbn.startsWith('wish-')).toBe(true);
    expect(book.needsReview).toBe(true);
    expect(book.amazonLink).toBe('');
    expect(book.metadataSource).toBe('manual');
  });
});
