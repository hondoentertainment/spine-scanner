import { describe, it, expect } from 'vitest';
import { parseCSV, extractISBNs, validateFileName } from './importLogic';

describe('parseCSV', () => {
    it('parses a simple CSV with ISBN column', () => {
        const csv = `Title,Author,ISBN
"1984","George Orwell","9780141036144"
"Dune","Frank Herbert","9780441013593"`;

        const result = parseCSV(csv);
        expect(result).toHaveLength(2);
        expect(result[0].isbn).toBe('9780141036144');
        expect(result[0].title).toBe('1984');
        expect(result[0].author).toBe('George Orwell');
    });

    it('handles header with "id" as ISBN column', () => {
        const csv = `Title,Id
"Test Book","9780141036144"`;

        const result = parseCSV(csv);
        expect(result).toHaveLength(1);
        expect(result[0].isbn).toBe('9780141036144');
    });

    it('returns empty array when no ISBN column found', () => {
        const csv = `Title,Author
"1984","George Orwell"`;

        expect(parseCSV(csv)).toEqual([]);
    });

    it('returns empty array for single-line CSV (headers only)', () => {
        const csv = `Title,Author,ISBN`;
        expect(parseCSV(csv)).toEqual([]);
    });

    it('filters out entries with ISBNs shorter than 10 chars', () => {
        const csv = `Title,ISBN
"Book A","9780141036144"
"Book B","123"`;

        const result = parseCSV(csv);
        expect(result).toHaveLength(1);
        expect(result[0].isbn).toBe('9780141036144');
    });

    it('returns empty array for empty input', () => {
        expect(parseCSV('')).toEqual([]);
    });
});

describe('extractISBNs', () => {
    it('extracts ISBN-13 with ISBN label', () => {
        const text = 'ISBN: 978-0-14-103614-4';
        const isbns = extractISBNs(text);
        expect(isbns).toContain('9780141036144');
    });

    it('extracts ISBN-10 from text', () => {
        const text = 'ISBN: 0306406152';
        const isbns = extractISBNs(text);
        expect(isbns).toContain('0306406152');
    });

    it('deduplicates ISBNs', () => {
        const text = '9780141036144 and again 9780141036144';
        const isbns = extractISBNs(text);
        const unique = isbns.filter(i => i === '9780141036144');
        expect(unique).toHaveLength(1);
    });

    it('returns empty array when no ISBNs found', () => {
        expect(extractISBNs('No ISBNs here')).toEqual([]);
    });
});

describe('validateFileName', () => {
    it('returns valid for normal CSV', () => {
        expect(validateFileName('books.csv')).toEqual({ valid: true });
    });

    it('returns valid with warning for .csv.txt', () => {
        const result = validateFileName('books.csv.txt');
        expect(result.valid).toBe(true);
        expect(result.warning).toBeDefined();
    });

    it('returns valid for .txt file', () => {
        expect(validateFileName('books.txt')).toEqual({ valid: true });
    });
});
