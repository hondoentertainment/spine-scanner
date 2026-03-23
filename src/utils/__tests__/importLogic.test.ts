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

describe('parseCSV – Goodreads format', () => {
  it('parses Goodreads CSV with ISBN and My Review columns', () => {
    const csv = `Title,Author,ISBN,Bookshelves,My Review
"The Great Gatsby","F. Scott Fitzgerald","9780141036144","read","Loved it"
"1984","George Orwell","9780544003415","to-read",""`;

    const result = parseCSV(csv);
    expect(result).toHaveLength(2);
    expect(result[0].isbn).toBe('9780141036144');
    expect(result[0].status).toBe('read');
    expect(result[0].notes).toBe('Loved it');
    expect(result[1].status).toBe('to-read');
    expect(result[1].notes).toBe('');
  });
});

describe('parseCSV – LibraryThing format', () => {
  it('parses LibraryThing CSV using ID column for ISBN', () => {
    const csv = `ID,Title,Author
"9780141036144","The Great Gatsby","F. Scott Fitzgerald"
"9780544003415","1984","George Orwell"`;

    const result = parseCSV(csv);
    expect(result).toHaveLength(2);
    expect(result[0].isbn).toBe('9780141036144');
    expect(result[0].title).toBe('The Great Gatsby');
  });
});

describe('parseCSV – edge cases', () => {
  it('handles empty file', () => {
    expect(parseCSV('')).toEqual([]);
  });

  it('handles file with only whitespace lines', () => {
    expect(parseCSV('  \n  \n  ')).toEqual([]);
  });

  it('handles malformed rows with missing fields', () => {
    const csv = `ISBN,Title,Author
"9780141036144"`;

    const result = parseCSV(csv);
    // Should still parse the row (missing fields default to empty string)
    expect(result).toHaveLength(1);
    expect(result[0].isbn).toBe('9780141036144');
    expect(result[0].title).toBe('');
  });

  it('handles rows without ISBN field value', () => {
    const csv = `ISBN,Title
"","Some Book"
"9780141036144","Valid Book"`;

    const result = parseCSV(csv);
    // Empty ISBN should be filtered out (length < 10)
    expect(result).toHaveLength(1);
    expect(result[0].isbn).toBe('9780141036144');
  });

  it('handles Windows-style CRLF line endings', () => {
    const csv = `ISBN,Title\r\n"9780141036144","Gatsby"\r\n"9780544003415","1984"`;

    const result = parseCSV(csv);
    expect(result).toHaveLength(2);
  });

  it('handles quoted fields containing commas', () => {
    const csv = `ISBN,Title,Author
"9780141036144","The Great, Gatsby","Fitzgerald, F. Scott"`;

    const result = parseCSV(csv);
    expect(result).toHaveLength(1);
    expect(result[0].isbn).toBe('9780141036144');
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
