import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  bookMatchesRule,
  bookMatchesSmartShelf,
  getBooksForSmartShelf,
  SMART_SHELF_TEMPLATES,
} from '../smartShelfEngine';
import type { BookEntry, SmartShelfRule, SmartShelf } from '../../types';

/* ================================================================
 *  Helpers
 * ================================================================ */

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'b1',
  isbn: '978-0-13-468599-1',
  title: 'The Great Gatsby',
  author: 'F. Scott Fitzgerald',
  pageCount: 180,
  amazonLink: '',
  coverImg: '',
  status: 'read',
  notes: '',
  dateAdded: '2025-12-01T10:00:00.000Z',
  shelfIds: [],
  rating: 4,
  metadataSource: 'google_books',
  ...overrides,
});

/* ================================================================
 *  bookMatchesRule
 * ================================================================ */

describe('bookMatchesRule', () => {
  /* ── equals operator ─────────────────────────────────────── */
  describe('equals operator', () => {
    it('matches status exactly', () => {
      const rule: SmartShelfRule = { field: 'status', operator: 'equals', value: 'read' };
      expect(bookMatchesRule(makeBook({ status: 'read' }), rule)).toBe(true);
      expect(bookMatchesRule(makeBook({ status: 'reading' }), rule)).toBe(false);
    });

    it('is case insensitive', () => {
      const rule: SmartShelfRule = { field: 'author', operator: 'equals', value: 'f. scott fitzgerald' };
      expect(bookMatchesRule(makeBook(), rule)).toBe(true);
    });

    it('matches metadataSource', () => {
      const rule: SmartShelfRule = { field: 'metadataSource', operator: 'equals', value: 'google_books' };
      expect(bookMatchesRule(makeBook({ metadataSource: 'google_books' }), rule)).toBe(true);
      expect(bookMatchesRule(makeBook({ metadataSource: 'manual' }), rule)).toBe(false);
    });

    it('returns false for undefined field', () => {
      const rule: SmartShelfRule = { field: 'rating', operator: 'equals', value: '4' };
      expect(bookMatchesRule(makeBook({ rating: undefined }), rule)).toBe(false);
    });
  });

  /* ── contains operator ───────────────────────────────────── */
  describe('contains operator', () => {
    it('matches substring in title', () => {
      const rule: SmartShelfRule = { field: 'title', operator: 'contains', value: 'Great' };
      expect(bookMatchesRule(makeBook(), rule)).toBe(true);
    });

    it('is case insensitive', () => {
      const rule: SmartShelfRule = { field: 'title', operator: 'contains', value: 'great' };
      expect(bookMatchesRule(makeBook(), rule)).toBe(true);
    });

    it('returns false when substring not found', () => {
      const rule: SmartShelfRule = { field: 'title', operator: 'contains', value: 'Moby' };
      expect(bookMatchesRule(makeBook(), rule)).toBe(false);
    });

    it('matches author substring', () => {
      const rule: SmartShelfRule = { field: 'author', operator: 'contains', value: 'Fitzgerald' };
      expect(bookMatchesRule(makeBook(), rule)).toBe(true);
    });
  });

  /* ── greaterThan operator ────────────────────────────────── */
  describe('greaterThan operator', () => {
    it('matches pageCount greater than value', () => {
      const rule: SmartShelfRule = { field: 'pageCount', operator: 'greaterThan', value: '100' };
      expect(bookMatchesRule(makeBook({ pageCount: 180 }), rule)).toBe(true);
      expect(bookMatchesRule(makeBook({ pageCount: 50 }), rule)).toBe(false);
    });

    it('does not match equal values', () => {
      const rule: SmartShelfRule = { field: 'pageCount', operator: 'greaterThan', value: '180' };
      expect(bookMatchesRule(makeBook({ pageCount: 180 }), rule)).toBe(false);
    });

    it('matches rating greater than value', () => {
      const rule: SmartShelfRule = { field: 'rating', operator: 'greaterThan', value: '3' };
      expect(bookMatchesRule(makeBook({ rating: 4 }), rule)).toBe(true);
      expect(bookMatchesRule(makeBook({ rating: 2 }), rule)).toBe(false);
    });

    it('returns false for non-numeric values', () => {
      const rule: SmartShelfRule = { field: 'pageCount', operator: 'greaterThan', value: 'abc' };
      expect(bookMatchesRule(makeBook(), rule)).toBe(false);
    });
  });

  /* ── lessThan operator ───────────────────────────────────── */
  describe('lessThan operator', () => {
    it('matches pageCount less than value', () => {
      const rule: SmartShelfRule = { field: 'pageCount', operator: 'lessThan', value: '200' };
      expect(bookMatchesRule(makeBook({ pageCount: 180 }), rule)).toBe(true);
      expect(bookMatchesRule(makeBook({ pageCount: 300 }), rule)).toBe(false);
    });

    it('does not match equal values', () => {
      const rule: SmartShelfRule = { field: 'pageCount', operator: 'lessThan', value: '180' };
      expect(bookMatchesRule(makeBook({ pageCount: 180 }), rule)).toBe(false);
    });
  });

  /* ── after operator ──────────────────────────────────────── */
  describe('after operator', () => {
    it('matches dateAdded after a specific date', () => {
      const rule: SmartShelfRule = { field: 'dateAdded', operator: 'after', value: '2025-01-01' };
      expect(bookMatchesRule(makeBook({ dateAdded: '2025-12-01T10:00:00.000Z' }), rule)).toBe(true);
      expect(bookMatchesRule(makeBook({ dateAdded: '2024-06-01T10:00:00.000Z' }), rule)).toBe(false);
    });

    it('supports last30days relative keyword', () => {
      // Set a fixed "now" for predictable tests
      const now = new Date('2026-01-15T12:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);

      const rule: SmartShelfRule = { field: 'dateAdded', operator: 'after', value: 'last30days' };
      // Book added 10 days ago -> should match
      expect(bookMatchesRule(makeBook({ dateAdded: '2026-01-05T12:00:00.000Z' }), rule)).toBe(true);
      // Book added 60 days ago -> should not match
      expect(bookMatchesRule(makeBook({ dateAdded: '2025-11-15T12:00:00.000Z' }), rule)).toBe(false);

      vi.useRealTimers();
    });

    it('supports last7days relative keyword', () => {
      const now = new Date('2026-01-15T12:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);

      const rule: SmartShelfRule = { field: 'dateAdded', operator: 'after', value: 'last7days' };
      expect(bookMatchesRule(makeBook({ dateAdded: '2026-01-12T12:00:00.000Z' }), rule)).toBe(true);
      expect(bookMatchesRule(makeBook({ dateAdded: '2025-12-01T12:00:00.000Z' }), rule)).toBe(false);

      vi.useRealTimers();
    });

    it('returns false for invalid date field', () => {
      const rule: SmartShelfRule = { field: 'dateAdded', operator: 'after', value: '2025-01-01' };
      expect(bookMatchesRule(makeBook({ dateAdded: 'not-a-date' }), rule)).toBe(false);
    });

    it('returns false for invalid value date', () => {
      const rule: SmartShelfRule = { field: 'dateAdded', operator: 'after', value: 'not-a-date' };
      expect(bookMatchesRule(makeBook(), rule)).toBe(false);
    });
  });

  /* ── before operator ─────────────────────────────────────── */
  describe('before operator', () => {
    it('matches dateAdded before a specific date', () => {
      const rule: SmartShelfRule = { field: 'dateAdded', operator: 'before', value: '2026-01-01' };
      expect(bookMatchesRule(makeBook({ dateAdded: '2025-12-01T10:00:00.000Z' }), rule)).toBe(true);
      expect(bookMatchesRule(makeBook({ dateAdded: '2026-06-01T10:00:00.000Z' }), rule)).toBe(false);
    });
  });
});

/* ================================================================
 *  bookMatchesSmartShelf (AND logic)
 * ================================================================ */

describe('bookMatchesSmartShelf', () => {
  it('returns true when all rules match', () => {
    const rules: SmartShelfRule[] = [
      { field: 'status', operator: 'equals', value: 'read' },
      { field: 'pageCount', operator: 'greaterThan', value: '100' },
    ];
    const book = makeBook({ status: 'read', pageCount: 200 });
    expect(bookMatchesSmartShelf(book, rules)).toBe(true);
  });

  it('returns false when any rule fails', () => {
    const rules: SmartShelfRule[] = [
      { field: 'status', operator: 'equals', value: 'read' },
      { field: 'pageCount', operator: 'greaterThan', value: '300' },
    ];
    const book = makeBook({ status: 'read', pageCount: 180 });
    expect(bookMatchesSmartShelf(book, rules)).toBe(false);
  });

  it('returns true for empty rules array', () => {
    expect(bookMatchesSmartShelf(makeBook(), [])).toBe(true);
  });

  it('handles multiple rules of different types', () => {
    const rules: SmartShelfRule[] = [
      { field: 'author', operator: 'contains', value: 'Fitzgerald' },
      { field: 'title', operator: 'contains', value: 'Gatsby' },
      { field: 'rating', operator: 'greaterThan', value: '3' },
    ];
    expect(bookMatchesSmartShelf(makeBook(), rules)).toBe(true);
  });
});

/* ================================================================
 *  getBooksForSmartShelf
 * ================================================================ */

describe('getBooksForSmartShelf', () => {
  const books: BookEntry[] = [
    makeBook({ id: 'b1', status: 'reading', pageCount: 500, title: 'War and Peace' }),
    makeBook({ id: 'b2', status: 'read', pageCount: 180, title: 'The Great Gatsby' }),
    makeBook({ id: 'b3', status: 'dnf', pageCount: 300, title: 'Ulysses' }),
    makeBook({ id: 'b4', status: 'reading', pageCount: 250, title: 'Dune' }),
  ];

  it('filters books matching shelf rules', () => {
    const shelf: SmartShelf = {
      id: 'ss1',
      name: 'Reading',
      color: '#a855f7',
      rules: [{ field: 'status', operator: 'equals', value: 'reading' }],
    };
    const result = getBooksForSmartShelf(books, shelf);
    expect(result).toHaveLength(2);
    expect(result.map((b) => b.id)).toEqual(['b1', 'b4']);
  });

  it('returns empty array when no books match', () => {
    const shelf: SmartShelf = {
      id: 'ss1',
      name: 'To Read',
      color: '#06b6d4',
      rules: [{ field: 'status', operator: 'equals', value: 'to-read' }],
    };
    expect(getBooksForSmartShelf(books, shelf)).toHaveLength(0);
  });

  it('returns all books when rules are empty', () => {
    const shelf: SmartShelf = { id: 'ss1', name: 'All', color: '#ccc', rules: [] };
    expect(getBooksForSmartShelf(books, shelf)).toHaveLength(4);
  });

  it('applies multiple rules (AND)', () => {
    const shelf: SmartShelf = {
      id: 'ss1',
      name: 'Long Reading',
      color: '#f59e0b',
      rules: [
        { field: 'status', operator: 'equals', value: 'reading' },
        { field: 'pageCount', operator: 'greaterThan', value: '400' },
      ],
    };
    const result = getBooksForSmartShelf(books, shelf);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b1');
  });
});

/* ================================================================
 *  Templates
 * ================================================================ */

describe('SMART_SHELF_TEMPLATES', () => {
  it('has at least 4 templates', () => {
    expect(SMART_SHELF_TEMPLATES.length).toBeGreaterThanOrEqual(4);
  });

  it('each template has name, color, and at least one rule', () => {
    for (const tmpl of SMART_SHELF_TEMPLATES) {
      expect(tmpl.name).toBeTruthy();
      expect(tmpl.color).toBeTruthy();
      expect(tmpl.rules.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('Currently Reading template matches reading books', () => {
    const tmpl = SMART_SHELF_TEMPLATES.find((t) => t.name === 'Currently Reading')!;
    const book = makeBook({ status: 'reading' });
    expect(bookMatchesSmartShelf(book, tmpl.rules)).toBe(true);
  });

  it('Long Reads template matches books with 400+ pages', () => {
    const tmpl = SMART_SHELF_TEMPLATES.find((t) => t.name.includes('Long Reads'))!;
    expect(bookMatchesSmartShelf(makeBook({ pageCount: 500 }), tmpl.rules)).toBe(true);
    expect(bookMatchesSmartShelf(makeBook({ pageCount: 200 }), tmpl.rules)).toBe(false);
  });

  it('Unfinished template matches dnf books', () => {
    const tmpl = SMART_SHELF_TEMPLATES.find((t) => t.name === 'Unfinished')!;
    expect(bookMatchesSmartShelf(makeBook({ status: 'dnf' }), tmpl.rules)).toBe(true);
    expect(bookMatchesSmartShelf(makeBook({ status: 'read' }), tmpl.rules)).toBe(false);
  });
});

/* ================================================================
 *  Edge cases
 * ================================================================ */

describe('edge cases', () => {
  it('handles book with missing optional fields gracefully', () => {
    const book = makeBook({ rating: undefined, metadataSource: undefined });
    const rule: SmartShelfRule = { field: 'rating', operator: 'greaterThan', value: '3' };
    expect(bookMatchesRule(book, rule)).toBe(false);
  });

  it('handles empty book list', () => {
    const shelf: SmartShelf = {
      id: 'ss1',
      name: 'Test',
      color: '#ccc',
      rules: [{ field: 'status', operator: 'equals', value: 'read' }],
    };
    expect(getBooksForSmartShelf([], shelf)).toHaveLength(0);
  });
});
