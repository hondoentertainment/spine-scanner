import { describe, it, expect } from 'vitest';
import { exportToGoodreadsCSV } from './goodreadsExport';
import type { BookEntry } from '../types';

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
    id: '1',
    isbn: '9780141036144',
    title: '1984',
    author: 'George Orwell',
    pageCount: 328,
    amazonLink: 'https://www.amazon.com/s?k=9780141036144',
    coverImg: '',
    status: 'read',
    notes: '',
    dateAdded: '2024-01-15T00:00:00.000Z',
    ...overrides,
});

describe('exportToGoodreadsCSV', () => {
    it('generates CSV with headers', () => {
        const csv = exportToGoodreadsCSV([]);
        expect(csv.startsWith('Title,Author,ISBN')).toBe(true);
    });

    it('includes book data in rows', () => {
        const csv = exportToGoodreadsCSV([makeBook()]);
        const lines = csv.split('\n');
        expect(lines).toHaveLength(2);
        expect(lines[1]).toContain('"1984"');
        expect(lines[1]).toContain('"George Orwell"');
        expect(lines[1]).toContain('"9780141036144"');
    });

    it('escapes quotes in title and author', () => {
        const csv = exportToGoodreadsCSV([makeBook({ title: 'Book "Title"', author: 'Author "Name"' })]);
        expect(csv).toContain('Book ""Title""');
        expect(csv).toContain('Author ""Name""');
    });

    it('includes reading status as Bookshelves', () => {
        const csv = exportToGoodreadsCSV([makeBook({ status: 'to-read' })]);
        expect(csv).toContain('to-read');
    });

    it('exports notes with escaped quotes', () => {
        const csv = exportToGoodreadsCSV([makeBook({ notes: 'Great "book"' })]);
        expect(csv).toContain('Great ""book""');
    });

    it('includes date added', () => {
        const csv = exportToGoodreadsCSV([makeBook()]);
        expect(csv).toContain('2024-01-15');
    });
});
