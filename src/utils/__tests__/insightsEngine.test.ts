import { describe, it, expect } from 'vitest';
import type { BookEntry } from '../../types.ts';
import {
  generateAdvancedInsights,
  getTopAuthors,
  suggestNextReads,
  generateFunFacts,
} from '../insightsEngine.ts';

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

describe('insightsEngine', () => {
  describe('generateAdvancedInsights', () => {
    it('returns full insights for a varied library', () => {
      const books: BookEntry[] = [
        makeBook({ id: '1', author: 'Orwell', status: 'read', pageCount: 300, rating: 5 }),
        makeBook({ id: '2', author: 'Orwell', status: 'read', pageCount: 200, rating: 4 }),
        makeBook({ id: '3', author: 'Tolkien', status: 'to-read', pageCount: 1000 }),
        makeBook({ id: '4', author: 'Tolkien', status: 'to-read', pageCount: 400 }),
        makeBook({ id: '5', author: 'Hemingway', status: 'dnf', pageCount: 150 }),
      ];
      const insights = generateAdvancedInsights(books);

      expect(insights.favoriteAuthors[0].author).toBe('Orwell');
      expect(insights.favoriteAuthors[0].count).toBe(2);
      expect(insights.averageBookLength).toBe(410);
      expect(insights.shortestBook?.pageCount).toBe(150);
      expect(insights.longestBook?.pageCount).toBe(1000);
      expect(insights.unreadBacklogSize).toBe(2);
      expect(insights.unreadBacklogPages).toBe(1400);
      expect(insights.completionRate).toBe(40);
      expect(insights.dnfRate).toBe(20);
      expect(insights.averageRating).toBe(4.5);
      expect(insights.suggestedNextReads.length).toBeGreaterThan(0);
      expect(insights.funFacts.length).toBeGreaterThan(0);
    });

    it('handles empty library', () => {
      const insights = generateAdvancedInsights([]);

      expect(insights.favoriteAuthors).toEqual([]);
      expect(insights.averageBookLength).toBe(0);
      expect(insights.shortestBook).toBeNull();
      expect(insights.longestBook).toBeNull();
      expect(insights.unreadBacklogSize).toBe(0);
      expect(insights.completionRate).toBe(0);
      expect(insights.dnfRate).toBe(0);
      expect(insights.averageRating).toBe(0);
      expect(insights.suggestedNextReads).toEqual([]);
      expect(insights.funFacts).toEqual([]);
    });

    it('handles single book library', () => {
      const insights = generateAdvancedInsights([
        makeBook({ id: '1', status: 'read', pageCount: 250 }),
      ]);

      expect(insights.completionRate).toBe(100);
      expect(insights.averageBookLength).toBe(250);
      expect(insights.shortestBook?.pageCount).toBe(250);
      expect(insights.longestBook?.pageCount).toBe(250);
    });

    it('computes estimated reading time from finished books pace', () => {
      const books: BookEntry[] = [
        makeBook({
          id: '1',
          status: 'read',
          pageCount: 300,
          startedReading: '2025-12-01T00:00:00.000Z',
          finishedReading: '2025-12-10T00:00:00.000Z', // 10 days, 300 pages = ~30/day
        }),
        makeBook({
          id: '2',
          status: 'read',
          pageCount: 300,
          startedReading: '2025-11-01T00:00:00.000Z',
          finishedReading: '2025-11-11T00:00:00.000Z',
        }),
        makeBook({ id: '3', status: 'to-read', pageCount: 600 }),
      ];
      const insights = generateAdvancedInsights(books);
      expect(insights.estimatedReadingTime).toMatch(/~\d+ (day|week|month|year)/);
    });
  });

  describe('getTopAuthors', () => {
    it('returns authors sorted by count', () => {
      const books = [
        makeBook({ author: 'A' }),
        makeBook({ author: 'A' }),
        makeBook({ author: 'A' }),
        makeBook({ author: 'B' }),
        makeBook({ author: 'B' }),
        makeBook({ author: 'C' }),
      ];
      const result = getTopAuthors(books, 2);
      expect(result).toEqual([
        { author: 'A', count: 3 },
        { author: 'B', count: 2 },
      ]);
    });

    it('returns empty for empty library', () => {
      expect(getTopAuthors([])).toEqual([]);
    });

    it('skips books with empty author', () => {
      const books = [
        makeBook({ author: '' }),
        makeBook({ author: 'Author' }),
      ];
      const result = getTopAuthors(books);
      expect(result).toEqual([{ author: 'Author', count: 1 }]);
    });

    it('defaults to limit of 5', () => {
      const books = Array.from({ length: 10 }, (_, i) =>
        makeBook({ author: `Author ${i}` }),
      );
      expect(getTopAuthors(books).length).toBe(5);
    });
  });

  describe('suggestNextReads', () => {
    it('returns only unread books', () => {
      const books = [
        makeBook({ id: '1', status: 'read' }),
        makeBook({ id: '2', status: 'reading' }),
        makeBook({ id: '3', status: 'to-read', title: 'Unread' }),
        makeBook({ id: '4', status: 'dnf' }),
      ];
      const suggestions = suggestNextReads(books);
      expect(suggestions.every((b) => b.status === 'to-read')).toBe(true);
      expect(suggestions.length).toBe(1);
    });

    it('returns empty for empty library', () => {
      expect(suggestNextReads([])).toEqual([]);
    });

    it('returns empty when nothing is to-read', () => {
      const books = [
        makeBook({ status: 'read' }),
        makeBook({ status: 'reading' }),
      ];
      expect(suggestNextReads(books)).toEqual([]);
    });

    it('prioritizes books by favorite authors', () => {
      const books = [
        makeBook({ id: '1', author: 'Popular', status: 'read' }),
        makeBook({ id: '2', author: 'Popular', status: 'read' }),
        makeBook({ id: '3', author: 'Popular', status: 'to-read', title: 'By Popular', pageCount: 500 }),
        makeBook({ id: '4', author: 'Unknown', status: 'to-read', title: 'By Unknown', pageCount: 500 }),
      ];
      const suggestions = suggestNextReads(books);
      expect(suggestions[0].author).toBe('Popular');
    });

    it('respects the limit parameter', () => {
      const books = Array.from({ length: 10 }, (_, i) =>
        makeBook({ id: String(i), status: 'to-read' }),
      );
      expect(suggestNextReads(books, 3).length).toBe(3);
    });
  });

  describe('generateFunFacts', () => {
    it('returns an array of strings', () => {
      const books = [
        makeBook({ status: 'read', pageCount: 2000 }),
        makeBook({ author: 'Test Author' }),
        makeBook({ author: 'Test Author' }),
      ];
      const facts = generateFunFacts(books);
      expect(Array.isArray(facts)).toBe(true);
      expect(facts.length).toBeGreaterThan(0);
      facts.forEach((f) => expect(typeof f).toBe('string'));
    });

    it('returns empty for empty library', () => {
      expect(generateFunFacts([])).toEqual([]);
    });

    it('includes War and Peace comparison when enough pages read', () => {
      const books = [makeBook({ status: 'read', pageCount: 1500 })];
      const facts = generateFunFacts(books);
      expect(facts.some((f) => f.includes('War and Peace'))).toBe(true);
    });

    it('includes favorite author when one has multiple books', () => {
      const books = [
        makeBook({ author: 'Stephen King' }),
        makeBook({ author: 'Stephen King' }),
        makeBook({ author: 'Other' }),
      ];
      const facts = generateFunFacts(books);
      expect(facts.some((f) => f.includes('Stephen King'))).toBe(true);
    });

    it('includes longest book fact', () => {
      const books = [
        makeBook({ title: 'Short Story', pageCount: 50 }),
        makeBook({ title: 'Epic Novel', pageCount: 800 }),
      ];
      const facts = generateFunFacts(books);
      expect(facts.some((f) => f.includes('Epic Novel'))).toBe(true);
    });
  });
});
