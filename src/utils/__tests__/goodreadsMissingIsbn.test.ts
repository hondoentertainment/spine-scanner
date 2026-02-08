import { describe, it, expect } from 'vitest';
import { exportToGoodreadsCSV } from '../goodreadsExport';
import { exportToJSON, importFromJSON, exportToStoryGraphCSV, exportToLibraryThingTSV } from '../exportFormats';
import type { BookEntry } from '../../types';

/**
 * ─── 3a. The Missing ISBN Sync ───────────────────────────────────
 *
 * Test: Export a book to Goodreads that was manually entered (no ISBN).
 *
 * Success: The app gracefully handles books without ISBNs in all
 * export formats. The export does not crash, the book is included
 * with title/author for manual matching on the import side.
 *
 * Note: Goodreads CSV import can match by title+author when ISBN is
 * missing, so the export must include those fields correctly.
 */

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'no-isbn-1',
  isbn: '',
  title: 'Manually Entered Book',
  author: 'Unknown Author',
  pageCount: 0,
  amazonLink: '',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: '2025-06-15T00:00:00.000Z',
  shelfIds: [],
  ...overrides,
});

const BOOKS_WITH_MISSING_ISBNS = [
  makeBook({
    id: 'manual-1',
    isbn: '',
    title: 'My Handwritten Zine',
    author: 'Local Artist',
    notes: 'Picked up at a craft fair',
  }),
  makeBook({
    id: 'normal-1',
    isbn: '9780141036144',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    status: 'read',
  }),
  makeBook({
    id: 'manual-2',
    isbn: '',
    title: 'Conference Proceedings 2024',
    author: 'Multiple Authors',
    pageCount: 450,
  }),
];

describe('Goodreads Export — Missing ISBN Handling', () => {
  it('does not crash when exporting a book with no ISBN', () => {
    expect(() => exportToGoodreadsCSV([makeBook({ isbn: '' })])).not.toThrow();
  });

  it('includes the book in the CSV even without an ISBN', () => {
    const csv = exportToGoodreadsCSV([makeBook({ isbn: '', title: 'No ISBN Book' })]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2); // header + 1 book
    expect(lines[1]).toContain('No ISBN Book');
  });

  it('preserves title and author for Goodreads title/author matching', () => {
    const csv = exportToGoodreadsCSV([makeBook({
      isbn: '',
      title: 'My Handwritten Zine',
      author: 'Local Artist',
    })]);

    expect(csv).toContain('My Handwritten Zine');
    expect(csv).toContain('Local Artist');
  });

  it('handles a mix of books with and without ISBNs', () => {
    const csv = exportToGoodreadsCSV(BOOKS_WITH_MISSING_ISBNS);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(4); // header + 3 books

    // All titles present
    expect(csv).toContain('My Handwritten Zine');
    expect(csv).toContain('The Great Gatsby');
    expect(csv).toContain('Conference Proceedings 2024');
  });

  it('ISBN column is empty string (not "undefined" or "null") for missing ISBNs', () => {
    const csv = exportToGoodreadsCSV([makeBook({ isbn: '' })]);
    expect(csv).not.toContain('undefined');
    expect(csv).not.toContain('null');

    // The ISBN field should be an empty quoted string
    const lines = csv.split('\n');
    const dataFields = lines[1]; // data row
    expect(dataFields).toContain('""'); // empty ISBN field
  });

  it('exports notes as "My Review" for manual-entry books', () => {
    const csv = exportToGoodreadsCSV([makeBook({
      isbn: '',
      notes: 'Picked up at a craft fair — great illustrations',
    })]);
    expect(csv).toContain('Picked up at a craft fair');
  });
});

describe('Other Export Formats — Missing ISBN Handling', () => {
  it('JSON round-trips books with empty ISBNs', () => {
    const json = exportToJSON(BOOKS_WITH_MISSING_ISBNS);
    const imported = importFromJSON(json);
    expect(imported.books).toHaveLength(3);

    const noIsbnBook = imported.books.find(b => b.id === 'manual-1');
    expect(noIsbnBook).toBeDefined();
    expect(noIsbnBook!.isbn).toBe('');
    expect(noIsbnBook!.title).toBe('My Handwritten Zine');
  });

  it('StoryGraph CSV handles missing ISBNs', () => {
    expect(() => exportToStoryGraphCSV(BOOKS_WITH_MISSING_ISBNS)).not.toThrow();
    const csv = exportToStoryGraphCSV(BOOKS_WITH_MISSING_ISBNS);
    expect(csv).toContain('My Handwritten Zine');
    expect(csv).not.toContain('undefined');
  });

  it('LibraryThing TSV handles missing ISBNs', () => {
    expect(() => exportToLibraryThingTSV(BOOKS_WITH_MISSING_ISBNS)).not.toThrow();
    const tsv = exportToLibraryThingTSV(BOOKS_WITH_MISSING_ISBNS);
    expect(tsv).toContain('My Handwritten Zine');
    expect(tsv).not.toContain('undefined');
  });
});

describe('Goodreads Export — Large Library (Rate Limit Resilience)', () => {
  it('exports 50+ books in a single CSV without truncation', () => {
    const largeLibrary = Array.from({ length: 55 }, (_, i) =>
      makeBook({
        id: `book-${i}`,
        isbn: i < 50 ? `978000000${String(i).padStart(4, '0')}` : '',
        title: `Book Number ${i + 1}`,
        author: `Author ${i + 1}`,
        status: i % 4 === 0 ? 'read' : i % 4 === 1 ? 'reading' : i % 4 === 2 ? 'to-read' : 'dnf',
      })
    );

    const csv = exportToGoodreadsCSV(largeLibrary);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(56); // header + 55 books

    // Verify first and last are present
    expect(csv).toContain('Book Number 1');
    expect(csv).toContain('Book Number 55');
  });
});
