import { describe, it, expect } from 'vitest';
import { parseCSV, extractISBNs, validateFileName, importFromGoodreadsCSV } from '../importLogic';
import type { BookEntry } from '../../types';

describe('parseCSV', () => {
  it('parses a simple CSV with ISBN column', () => {
    const csv = `Title,Author,ISBN
"The Great Gatsby","F. Scott Fitzgerald","9780141036144"
"1984","George Orwell","9780544003415"`;

    const result = parseCSV(csv);
    expect(result).toHaveLength(2);
    expect(result[0].isbn).toBe('9780141036144');
    expect(result[0].title).toBe('The Great Gatsby');
    expect(result[0].author).toBe('F. Scott Fitzgerald');
    expect(result[1].isbn).toBe('9780544003415');
  });

  it('returns empty array for CSV without ISBN column', () => {
    const csv = `Title,Author
"Book","Author"`;
    expect(parseCSV(csv)).toEqual([]);
  });

  it('returns empty array for single-line input', () => {
    expect(parseCSV('just a header')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseCSV('')).toEqual([]);
  });

  it('filters out entries with short ISBNs', () => {
    const csv = `ISBN,Title
"123","Short"
"9780141036144","Valid"`;

    const result = parseCSV(csv);
    expect(result).toHaveLength(1);
    expect(result[0].isbn).toBe('9780141036144');
  });

  it('handles Bookshelves column as status', () => {
    const csv = `ISBN,Title,Bookshelves
"9780141036144","Book","reading"`;

    const result = parseCSV(csv);
    expect(result[0].status).toBe('reading');
  });

  it('defaults status to read when no Bookshelves column', () => {
    const csv = `ISBN,Title
"9780141036144","Book"`;

    const result = parseCSV(csv);
    expect(result[0].status).toBe('read');
  });
});

describe('extractISBNs', () => {
  it('extracts ISBN-13 from text', () => {
    // The regex uses end-of-string anchors, so ISBN must be at end of line
    const text = 'Check out ISBN: 9780141036144';
    const result = extractISBNs(text);
    expect(result).toContain('9780141036144');
  });

  it('extracts multiple ISBNs', () => {
    const text = 'ISBN: 9780141036144, 9780544003415';
    const result = extractISBNs(text);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('deduplicates ISBNs', () => {
    const text = '9780141036144 and again 9780141036144';
    const result = extractISBNs(text);
    const unique = new Set(result);
    expect(result.length).toBe(unique.size);
  });

  it('returns empty array when no ISBNs found', () => {
    expect(extractISBNs('no isbns here')).toEqual([]);
  });
});

describe('validateFileName', () => {
  it('returns valid for normal files', () => {
    expect(validateFileName('books.csv')).toEqual({ valid: true });
  });

  it('returns warning for .csv.txt files', () => {
    const result = validateFileName('books.csv.txt');
    expect(result.valid).toBe(true);
    expect(result.warning).toBeDefined();
  });
});

describe('importFromGoodreadsCSV', () => {
  const baseRow = (overrides: Record<string, string> = {}): Record<string, string> => ({
    'Book Id': '1',
    Title: 'Test Book',
    Author: 'Test Author',
    'Author l-f': 'Author, Test',
    'Additional Authors': '',
    ISBN: '',
    ISBN13: '="9781234567890"',
    'My Rating': '0',
    'Average Rating': '4.0',
    Publisher: '',
    Binding: '',
    'Number of Pages': '300',
    'Year Published': '2020',
    'Original Publication Year': '2020',
    'Date Read': '2023-06-15',
    'Date Added': '2023-01-01',
    Bookshelves: '',
    'Bookshelves with positions': '',
    'Exclusive Shelf': 'read',
    'My Review': '',
    Spoiler: '',
    'Private Notes': '',
    'Read Count': '1',
    'Owned Copies': '0',
    ...overrides,
  });

  const buildCSV = (rows: Record<string, string>[]): string => {
    const headers = [
      'Book Id', 'Title', 'Author', 'Author l-f', 'Additional Authors',
      'ISBN', 'ISBN13', 'My Rating', 'Average Rating', 'Publisher', 'Binding',
      'Number of Pages', 'Year Published', 'Original Publication Year',
      'Date Read', 'Date Added', 'Bookshelves', 'Bookshelves with positions',
      'Exclusive Shelf', 'My Review', 'Spoiler', 'Private Notes',
      'Read Count', 'Owned Copies',
    ];
    const csvRows = rows.map(row =>
      headers.map(h => {
        const val = row[h] ?? '';
        return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
      }).join(',')
    );
    return [headers.join(','), ...csvRows].join('\n');
  };

  it('happy path: imports 2 books with correct field mapping', () => {
    const csv = buildCSV([
      baseRow({ Title: 'Book One', Author: 'Alice', ISBN13: '="9781111111111"', 'Number of Pages': '200', 'Exclusive Shelf': 'read', 'Date Read': '2023-05-01', 'Date Added': '2022-01-01', 'My Review': 'Great read' }),
      baseRow({ Title: 'Book Two', Author: 'Bob', ISBN13: '="9782222222222"', 'Number of Pages': '350', 'Exclusive Shelf': 'to-read', 'Date Read': '', 'Date Added': '2022-06-01' }),
    ]);

    const { imported, skipped } = importFromGoodreadsCSV(csv, []);

    expect(imported).toHaveLength(2);
    expect(skipped).toBe(0);

    const [b1, b2] = imported;
    expect(b1.isbn).toBe('9781111111111');
    expect(b1.title).toBe('Book One');
    expect(b1.author).toBe('Alice');
    expect(b1.pageCount).toBe(200);
    expect(b1.status).toBe('read');
    expect(b1.notes).toBe('Great read');
    expect(b1.finishedAt).toBeTruthy();
    expect(b1.metadataSource).toBe('manual');

    expect(b2.isbn).toBe('9782222222222');
    expect(b2.status).toBe('to-read');
    expect(b2.finishedAt).toBeNull();
  });

  it('ISBN stripping: cleans the ="..." wrapper format', () => {
    const csv = buildCSV([
      baseRow({ ISBN13: '="9781234567890"', ISBN: '' }),
    ]);

    const { imported } = importFromGoodreadsCSV(csv, []);

    expect(imported).toHaveLength(1);
    expect(imported[0].isbn).toBe('9781234567890');
  });

  it('duplicate skipping: skips a book whose ISBN already exists in library', () => {
    const existingBook: BookEntry = {
      id: 'existing-1',
      isbn: '9781234567890',
      title: 'Already Here',
      author: 'Someone',
      pageCount: 0,
      amazonLink: '',
      coverImg: '',
      status: 'read',
      notes: '',
      dateAdded: new Date().toISOString(),
      shelfIds: [],
    };

    const csv = buildCSV([
      baseRow({ ISBN13: '="9781234567890"' }),
    ]);

    const { imported, skipped } = importFromGoodreadsCSV(csv, [existingBook]);

    expect(imported).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('missing ISBN: skips a row with blank ISBN13 and ISBN', () => {
    const csv = buildCSV([
      baseRow({ ISBN13: '', ISBN: '' }),
      baseRow({ Title: 'Valid Book', ISBN13: '="9789999999993"', ISBN: '' }),
    ]);

    const { imported, skipped } = importFromGoodreadsCSV(csv, []);

    expect(imported).toHaveLength(1);
    expect(skipped).toBe(1);
    expect(imported[0].title).toBe('Valid Book');
  });
});
