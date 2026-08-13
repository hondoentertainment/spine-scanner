import { describe, it, expect } from 'vitest';
import { exportToGoodreadsCSV } from '../goodreadsExport';
import { importFromGoodreadsCSV } from '../importLogic';
import type { BookEntry } from '../../types';

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: '1',
  isbn: '9780141036144',
  title: 'The Great Gatsby',
  author: 'F. Scott Fitzgerald',
  pageCount: 180,
  amazonLink: 'https://amazon.com/s?k=9780141036144',
  coverImg: 'https://example.com/cover.jpg',
  status: 'read',
  notes: '',
  dateAdded: '2025-01-15T00:00:00.000Z',
  finishedAt: '2025-03-20T00:00:00.000Z',
  shelfIds: [],
  metadataSource: 'manual',
  ...overrides,
});

/** RFC 4180 field parser: respects quoted fields (double-quotes escape a quote inside). */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else {
      if (ch === ',') { fields.push(cur); cur = ''; }
      else if (ch === '"') inQuotes = true;
      else cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

describe('exportToGoodreadsCSV', () => {
  it('generates CSV with Goodreads-native headers', () => {
    const csv = exportToGoodreadsCSV([]);
    const header = csv.split('\r\n')[0];
    expect(header).toContain('Title');
    expect(header).toContain('Author');
    expect(header).toContain('ISBN');
    expect(header).toContain('ISBN13');
    expect(header).toContain('Number of Pages');
    expect(header).toContain('Exclusive Shelf');
    expect(header).toContain('My Review');
    expect(header).toContain('Date Read');
    expect(header).toContain('Date Added');
  });

  it('exports book data with Goodreads-native ISBN wrapper', () => {
    const csv = exportToGoodreadsCSV([makeBook()]);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('The Great Gatsby');
    expect(lines[1]).toContain('F. Scott Fitzgerald');
    // Goodreads uses ="..." to stop Excel converting long ISBNs to scientific notation.
    expect(lines[1]).toContain('="9780141036144"');
  });

  it('quotes and escapes double quotes only when needed (RFC 4180)', () => {
    const csv = exportToGoodreadsCSV([makeBook({ title: 'A "Great" Book' })]);
    expect(csv).toContain('"A ""Great"" Book"');
  });

  it('leaves plain fields unquoted (RFC 4180-compliant)', () => {
    const csv = exportToGoodreadsCSV([makeBook({ title: 'Gatsby', author: 'Fitzgerald' })]);
    // Plain fields with no special chars: no wrapping quotes.
    const row = csv.split('\r\n')[1];
    expect(row).toContain(',Gatsby,');
    expect(row).toContain(',Fitzgerald,');
  });

  it('populates Date Read from finishedAt (not the current date)', () => {
    const csv = exportToGoodreadsCSV([makeBook({ finishedAt: '2025-03-20T00:00:00.000Z' })]);
    expect(csv).toContain('2025-03-20');
  });

  it('leaves Date Read empty when finishedAt is missing', () => {
    const csv = exportToGoodreadsCSV([makeBook({ status: 'to-read', finishedAt: null })]);
    const header = parseCsvLine(csv.split('\r\n')[0]);
    const row = parseCsvLine(csv.split('\r\n')[1]);
    const dateReadIdx = header.indexOf('Date Read');
    expect(dateReadIdx).toBeGreaterThan(-1);
    expect(row[dateReadIdx]).toBe('');
  });

  it('maps status -> Exclusive Shelf using Goodreads names', () => {
    const shelfOf = (status: BookEntry['status']): string => {
      const csv = exportToGoodreadsCSV([makeBook({ status })]);
      const header = parseCsvLine(csv.split('\r\n')[0]);
      const row = parseCsvLine(csv.split('\r\n')[1]);
      return row[header.indexOf('Exclusive Shelf')];
    };
    expect(shelfOf('to-read')).toBe('to-read');
    expect(shelfOf('reading')).toBe('currently-reading');
    expect(shelfOf('read')).toBe('read');
    // Goodreads has no DNF shelf; fall back to read + tag dnf in Bookshelves.
    expect(shelfOf('dnf')).toBe('read');
  });

  it('tags dnf books in Bookshelves so intent survives the round-trip', () => {
    const csv = exportToGoodreadsCSV([makeBook({ status: 'dnf' })]);
    expect(csv).toContain('"read, dnf"');
  });

  it('includes notes in My Review', () => {
    const csv = exportToGoodreadsCSV([makeBook({ notes: 'Wonderful book' })]);
    expect(csv).toContain('Wonderful book');
  });

  it('populates Number of Pages from pageCount', () => {
    const csv = exportToGoodreadsCSV([makeBook({ pageCount: 512 })]);
    const header = parseCsvLine(csv.split('\r\n')[0]);
    const row = parseCsvLine(csv.split('\r\n')[1]);
    expect(row[header.indexOf('Number of Pages')]).toBe('512');
  });

  it('exports multiple books with CRLF line endings', () => {
    const books = [
      makeBook({ id: '1', title: 'Book One' }),
      makeBook({ id: '2', title: 'Book Two', isbn: '9780544003415' }),
    ];
    const csv = exportToGoodreadsCSV(books);
    expect(csv.split('\r\n')).toHaveLength(3);
  });

  it('round-trips through importFromGoodreadsCSV', () => {
    const src: BookEntry[] = [
      makeBook({
        id: '1',
        isbn: '9780141036144',
        title: 'The Great Gatsby',
        author: 'F. Scott Fitzgerald',
        pageCount: 180,
        status: 'read',
        notes: 'A classic',
        dateAdded: '2025-01-15T00:00:00.000Z',
        finishedAt: '2025-03-20T00:00:00.000Z',
      }),
      makeBook({
        id: '2',
        isbn: '9780544003415',
        title: 'The Fellowship of the Ring',
        author: 'J.R.R. Tolkien',
        pageCount: 423,
        status: 'to-read',
        notes: '',
        dateAdded: '2025-02-01T00:00:00.000Z',
        finishedAt: null,
      }),
      makeBook({
        id: '3',
        isbn: '9780316769488',
        title: 'The Catcher in the Rye',
        author: 'J.D. Salinger',
        pageCount: 214,
        status: 'reading',
        notes: '',
        dateAdded: '2025-02-10T00:00:00.000Z',
        finishedAt: null,
      }),
    ];

    const csv = exportToGoodreadsCSV(src);
    const { imported, skipped } = importFromGoodreadsCSV(csv, []);

    expect(skipped).toBe(0);
    expect(imported).toHaveLength(3);

    const [gatsby, lotr, catcher] = imported;
    expect(gatsby.isbn).toBe('9780141036144');
    expect(gatsby.title).toBe('The Great Gatsby');
    expect(gatsby.author).toBe('F. Scott Fitzgerald');
    expect(gatsby.pageCount).toBe(180);
    expect(gatsby.status).toBe('read');
    expect(gatsby.notes).toBe('A classic');
    expect(gatsby.finishedAt).toBe('2025-03-20T00:00:00.000Z');
    expect(gatsby.dateAdded).toBe('2025-01-15T00:00:00.000Z');

    expect(lotr.status).toBe('to-read');
    expect(lotr.finishedAt).toBeNull();

    expect(catcher.status).toBe('reading');
    expect(catcher.finishedAt).toBeNull();
  });

  it('round-trip skips duplicates when importing against existing books', () => {
    const book = makeBook();
    const csv = exportToGoodreadsCSV([book, book]);
    const { imported, skipped } = importFromGoodreadsCSV(csv, [book]);
    // Both CSV rows have the same ISBN; both should be skipped as duplicates
    // (one matches existing, one matches the row that was already ingested).
    expect(imported).toHaveLength(0);
    expect(skipped).toBe(2);
  });
});
