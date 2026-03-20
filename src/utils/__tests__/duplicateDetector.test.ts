import { describe, it, expect } from 'vitest';
import type { BookEntry } from '../../types.ts';
import {
  findDuplicates,
  stringSimilarity,
  normalizeTitle,
} from '../duplicateDetector.ts';

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: crypto.randomUUID(),
  isbn: '9780141036144',
  title: '1984',
  author: 'George Orwell',
  pageCount: 328,
  amazonLink: '',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: '2026-01-15T00:00:00.000Z',
  shelfIds: [],
  ...overrides,
});

describe('duplicateDetector', () => {
  describe('findDuplicates', () => {
    it('detects books with the same ISBN', () => {
      const books = [
        makeBook({ id: 'a', isbn: '9780141036144', title: 'Nineteen Eighty-Four' }),
        makeBook({ id: 'b', isbn: '9780141036144', title: '1984' }),
        makeBook({ id: 'c', isbn: '9780451524935', title: 'Other Book' }),
      ];
      const groups = findDuplicates(books);
      expect(groups.length).toBe(1);
      expect(groups[0].reason).toBe('same_isbn');
      expect(groups[0].books.length).toBe(2);
      expect(groups[0].confidence).toBe(1);
    });

    it('detects books with similar titles by the same author', () => {
      const books = [
        makeBook({ id: 'a', isbn: '111', title: 'The Great Gatsby', author: 'F. Scott Fitzgerald' }),
        makeBook({ id: 'b', isbn: '222', title: 'Great Gatsby', author: 'F. Scott Fitzgerald' }),
      ];
      const groups = findDuplicates(books);
      expect(groups.length).toBe(1);
      expect(groups[0].reason).toBe('same_author_similar_title');
      expect(groups[0].confidence).toBeGreaterThan(0.5);
    });

    it('detects very similar titles even with different authors', () => {
      const books = [
        makeBook({ id: 'a', isbn: '111', title: 'The Art of War', author: 'Sun Tzu' }),
        makeBook({ id: 'b', isbn: '222', title: 'The Art of War', author: 'Sun Tzu (translated)' }),
      ];
      const groups = findDuplicates(books);
      expect(groups.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty for no duplicates', () => {
      const books = [
        makeBook({ id: 'a', isbn: '111', title: 'Book One', author: 'Author A' }),
        makeBook({ id: 'b', isbn: '222', title: 'Completely Different', author: 'Author B' }),
      ];
      const groups = findDuplicates(books);
      expect(groups).toEqual([]);
    });

    it('returns empty for empty library', () => {
      expect(findDuplicates([])).toEqual([]);
    });

    it('returns empty for single book', () => {
      expect(findDuplicates([makeBook()])).toEqual([]);
    });

    it('ignores photo-only books for ISBN matching', () => {
      const books = [
        makeBook({ id: 'a', isbn: 'photo-abc123' }),
        makeBook({ id: 'b', isbn: 'photo-abc123' }),
      ];
      const groups = findDuplicates(books);
      // Should not match on photo ISBNs
      const isbnGroups = groups.filter((g) => g.reason === 'same_isbn');
      expect(isbnGroups.length).toBe(0);
    });

    it('sorts groups by confidence descending', () => {
      const books = [
        makeBook({ id: 'a', isbn: '111', title: 'Alpha', author: 'Same' }),
        makeBook({ id: 'b', isbn: '111', title: 'Beta', author: 'Same' }),
        makeBook({ id: 'c', isbn: '333', title: 'The Catcher in the Rye', author: 'JD Salinger' }),
        makeBook({ id: 'd', isbn: '444', title: 'Catcher in the Rye', author: 'JD Salinger' }),
      ];
      const groups = findDuplicates(books);
      for (let i = 1; i < groups.length; i++) {
        expect(groups[i - 1].confidence).toBeGreaterThanOrEqual(groups[i].confidence);
      }
    });
  });

  describe('stringSimilarity', () => {
    it('returns 1 for identical strings', () => {
      expect(stringSimilarity('hello', 'hello')).toBe(1);
    });

    it('returns 0 for empty strings', () => {
      expect(stringSimilarity('', 'hello')).toBe(0);
      expect(stringSimilarity('hello', '')).toBe(0);
    });

    it('returns 0 for both empty', () => {
      // Both empty are identical
      expect(stringSimilarity('', '')).toBe(1);
    });

    it('returns high similarity for similar strings', () => {
      const sim = stringSimilarity('kitten', 'sitting');
      expect(sim).toBeGreaterThan(0.4);
      expect(sim).toBeLessThan(1);
    });

    it('returns low similarity for very different strings', () => {
      const sim = stringSimilarity('abc', 'xyz');
      expect(sim).toBeLessThan(0.5);
    });

    it('is case-sensitive', () => {
      const sim = stringSimilarity('Hello', 'hello');
      expect(sim).toBeLessThan(1);
    });
  });

  describe('normalizeTitle', () => {
    it('lowercases the title', () => {
      expect(normalizeTitle('The Great Gatsby')).toBe('great gatsby');
    });

    it('removes leading articles (the, a, an)', () => {
      expect(normalizeTitle('The Catcher in the Rye')).toBe('catcher in the rye');
      expect(normalizeTitle('A Tale of Two Cities')).toBe('tale of two cities');
      expect(normalizeTitle('An Example Book')).toBe('example book');
    });

    it('removes punctuation', () => {
      expect(normalizeTitle("Harry Potter: The Philosopher's Stone")).toBe('harry potter the philosophers stone');
    });

    it('collapses whitespace', () => {
      expect(normalizeTitle('  Too   Many   Spaces  ')).toBe('too many spaces');
    });

    it('handles empty string', () => {
      expect(normalizeTitle('')).toBe('');
    });
  });
});
