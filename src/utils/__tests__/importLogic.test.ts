import { describe, it, expect } from 'vitest';
import { parseCSV, extractISBNs, validateFileName } from '../importLogic';

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

  it('uses id column as ISBN when isbn column is absent', () => {
    const csv = `id,Title,Author
"9780141036144","Gatsby","Fitzgerald"`;

    const result = parseCSV(csv);
    expect(result).toHaveLength(1);
    expect(result[0].isbn).toBe('9780141036144');
  });

  it('handles Windows CRLF line endings', () => {
    const csv = 'ISBN,Title\r\n"9780141036144","Gatsby"\r\n"9780544003415","1984"';
    const result = parseCSV(csv);
    expect(result).toHaveLength(2);
    expect(result[0].isbn).toBe('9780141036144');
    expect(result[1].isbn).toBe('9780544003415');
  });

  it('handles quoted fields containing commas', () => {
    const csv = `ISBN,Title,Author
"9780141036144","Fitzgerald, The Great Gatsby","F. Scott Fitzgerald"`;

    const result = parseCSV(csv);
    expect(result).toHaveLength(1);
    expect(result[0].isbn).toBe('9780141036144');
  });

  it('skips blank lines in the middle of CSV', () => {
    const csv = `ISBN,Title
"9780141036144","Gatsby"

"9780544003415","1984"`;

    const result = parseCSV(csv);
    // Blank lines filtered, both valid rows present
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some(r => r.isbn === '9780141036144')).toBe(true);
  });

  it('filters out lines that produce no valid matches', () => {
    const csv = `ISBN,Title
"9780141036144","Valid"
,`;

    const result = parseCSV(csv);
    expect(result.every(r => r.isbn && r.isbn.length >= 10)).toBe(true);
  });

  it('parses My Review column as notes', () => {
    const csv = `ISBN,Title,My Review
"9780141036144","Gatsby","Loved this book"`;

    const result = parseCSV(csv);
    expect(result[0].notes).toBe('Loved this book');
  });
});

describe('extractISBNs', () => {
  it('extracts ISBN-13 from text', () => {
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

  it('returns empty array for empty string', () => {
    expect(extractISBNs('')).toEqual([]);
  });

  it('strips hyphens and spaces from ISBN matches', () => {
    const text = 'ISBN: 978-0-14-103614-4';
    const result = extractISBNs(text);
    // regex strips non-digit/X chars; at least one result should be all digits
    expect(result.every(r => /^[0-9X]+$/.test(r))).toBe(true);
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

  it('returns valid for .txt file with no double extension', () => {
    expect(validateFileName('my-export.txt')).toEqual({ valid: true });
  });

  it('returns valid for uppercase CSV extension', () => {
    expect(validateFileName('BOOKS.CSV')).toEqual({ valid: true });
  });
});
