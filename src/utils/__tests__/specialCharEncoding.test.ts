import { describe, it, expect } from 'vitest';
import { exportToJSON, importFromJSON, exportToLibraryThingTSV, exportToStoryGraphCSV } from '../exportFormats';
import { exportToGoodreadsCSV } from '../goodreadsExport';
import type { BookEntry } from '../../types';

/**
 * ─── 1c. Special Character Encoding ─────────────────────────────
 *
 * Test: Scan a book with a subtitle or author name containing
 * non-English characters (e.g., "The Seven Moons of Maali Almeida"
 * or books by authors with diacritics).
 *
 * Success: Title is rendered correctly in the list without "broken"
 * Unicode symbols (no mojibake, no ??????, no â€™).
 */

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'unicode-1',
  isbn: '9780141036144',
  title: 'Test Book',
  author: 'Test Author',
  pageCount: 200,
  amazonLink: 'https://amazon.com/s?k=9780141036144',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: '2025-06-15T00:00:00.000Z',
  shelfIds: [],
  ...overrides,
});

// ─── Test data with challenging Unicode characters ────────────────

const UNICODE_BOOKS = {
  diacritics: makeBook({
    id: 'u-1',
    isbn: '9780060883287',
    title: 'One Hundred Years of Solitude',
    author: 'Gabriel García Márquez',
  }),
  sriLankan: makeBook({
    id: 'u-2',
    isbn: '9781788165693',
    title: 'The Seven Moons of Maali Almeida',
    author: 'Shehan Karunatilaka',
    notes: 'Won the 2022 Booker Prize — brilliant magical realism',
  }),
  japanese: makeBook({
    id: 'u-3',
    isbn: '9780375718946',
    title: 'Norwegian Wood (ノルウェイの森)',
    author: 'Haruki Murakami (村上 春樹)',
    notes: 'Original title: ノルウェイの森',
  }),
  german: makeBook({
    id: 'u-4',
    isbn: '9783596295579',
    title: 'Die Verwandlung',
    author: 'Franz Kafka',
    notes: 'Über die Entfremdung des modernen Menschen',
  }),
  french: makeBook({
    id: 'u-5',
    isbn: '9782070360024',
    title: "L'Étranger",
    author: 'Albert Camus',
  }),
  arabic: makeBook({
    id: 'u-6',
    isbn: '9780140449136',
    title: 'The Rubáiyát of Omar Khayyám',
    author: 'Omar Khayyám (عمر خیام)',
  }),
  emDashes: makeBook({
    id: 'u-7',
    isbn: '9780743273565',
    title: 'The Great Gatsby — A Novel',
    author: "F. Scott Fitzgerald",
    notes: "So we beat on—boats against the current",
  }),
  curlyQuotes: makeBook({
    id: 'u-8',
    isbn: '9780316769488',
    title: 'The Catcher in the Rye',
    author: 'J. D. Salinger',
    notes: '"Don\u2019t ever tell anybody anything." \u2014 Holden Caulfield',
  }),
};

describe('Special Character Encoding — Unicode in Titles and Authors', () => {
  describe('JSON round-trip preserves Unicode', () => {
    it('preserves Spanish diacritics (García Márquez)', () => {
      const json = exportToJSON([UNICODE_BOOKS.diacritics]);
      const imported = importFromJSON(json);
      expect(imported.books[0].author).toBe('Gabriel García Márquez');
      expect(imported.books[0].author).toContain('á'); // García and Márquez both have á
      expect(imported.books[0].author).toContain('í'); // García has í
    });

    it('preserves Japanese characters (Murakami)', () => {
      const json = exportToJSON([UNICODE_BOOKS.japanese]);
      const imported = importFromJSON(json);
      expect(imported.books[0].title).toContain('ノルウェイの森');
      expect(imported.books[0].author).toContain('村上 春樹');
    });

    it('preserves French accented characters (L\'Étranger)', () => {
      const json = exportToJSON([UNICODE_BOOKS.french]);
      const imported = importFromJSON(json);
      expect(imported.books[0].title).toBe("L'Étranger");
      expect(imported.books[0].title).toContain('É');
    });

    it('preserves Arabic script (Omar Khayyám)', () => {
      const json = exportToJSON([UNICODE_BOOKS.arabic]);
      const imported = importFromJSON(json);
      expect(imported.books[0].author).toContain('عمر خیام');
      expect(imported.books[0].title).toContain('Rubáiyát');
    });

    it('preserves German umlauts and special chars', () => {
      const json = exportToJSON([UNICODE_BOOKS.german]);
      const imported = importFromJSON(json);
      expect(imported.books[0].notes).toContain('Über');
    });

    it('round-trips ALL Unicode books in a batch', () => {
      const allBooks = Object.values(UNICODE_BOOKS);
      const json = exportToJSON(allBooks);
      const imported = importFromJSON(json);
      expect(imported.books).toHaveLength(allBooks.length);

      // Verify each book's title is intact
      for (const original of allBooks) {
        const found = imported.books.find(b => b.id === original.id);
        expect(found).toBeDefined();
        expect(found!.title).toBe(original.title);
        expect(found!.author).toBe(original.author);
        expect(found!.notes).toBe(original.notes);
      }
    });
  });

  describe('Goodreads CSV preserves Unicode', () => {
    it('exports diacritics correctly in Goodreads format', () => {
      const csv = exportToGoodreadsCSV([UNICODE_BOOKS.diacritics]);
      expect(csv).toContain('Gabriel García Márquez');
      // Should not contain HTML entities or escape sequences
      expect(csv).not.toContain('&aacute;');
      expect(csv).not.toContain('\\u');
    });

    it('exports Japanese characters in Goodreads format', () => {
      const csv = exportToGoodreadsCSV([UNICODE_BOOKS.japanese]);
      expect(csv).toContain('ノルウェイの森');
    });

    it('handles curly quotes and em dashes in notes', () => {
      const csv = exportToGoodreadsCSV([UNICODE_BOOKS.curlyQuotes]);
      expect(csv).toContain('\u2019'); // Right single quotation mark
      expect(csv).toContain('\u2014'); // Em dash
    });
  });

  describe('LibraryThing TSV preserves Unicode', () => {
    it('exports French title correctly', () => {
      const tsv = exportToLibraryThingTSV([UNICODE_BOOKS.french]);
      expect(tsv).toContain("L'Étranger");
    });

    it('exports Arabic author name correctly', () => {
      const tsv = exportToLibraryThingTSV([UNICODE_BOOKS.arabic]);
      expect(tsv).toContain('عمر خیام');
    });
  });

  describe('StoryGraph CSV preserves Unicode', () => {
    it('exports German title correctly', () => {
      const csv = exportToStoryGraphCSV([UNICODE_BOOKS.german]);
      expect(csv).toContain('Die Verwandlung');
    });

    it('handles titles with embedded parentheses and CJK chars', () => {
      const csv = exportToStoryGraphCSV([UNICODE_BOOKS.japanese]);
      expect(csv).toContain('ノルウェイの森');
    });
  });

  describe('No broken Unicode (mojibake detection)', () => {
    it('does not produce common mojibake patterns', () => {
      const allBooks = Object.values(UNICODE_BOOKS);
      const json = exportToJSON(allBooks);

      // Common mojibake patterns that indicate broken encoding
      expect(json).not.toContain('Ã¡'); // á broken
      expect(json).not.toContain('Ã©'); // é broken
      expect(json).not.toContain('â€™'); // ' broken
      expect(json).not.toContain('â€"'); // — broken
      expect(json).not.toContain('Ã¼'); // ü broken
      expect(json).not.toContain('\ufffd'); // Unicode replacement character
    });

    it('titles do not contain Unicode replacement characters after import', () => {
      const allBooks = Object.values(UNICODE_BOOKS);
      const json = exportToJSON(allBooks);
      const imported = importFromJSON(json);

      for (const book of imported.books) {
        expect(book.title).not.toContain('\ufffd');
        expect(book.author).not.toContain('\ufffd');
        expect(book.notes).not.toContain('\ufffd');
      }
    });
  });
});
