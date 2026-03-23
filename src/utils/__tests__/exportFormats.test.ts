import { describe, it, expect } from 'vitest';
import { exportToJSON, importFromJSON, exportToLibraryThingTSV, exportToStoryGraphCSV } from '../exportFormats';
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
    notes: 'A classic',
    dateAdded: '2025-01-15T00:00:00.000Z',
    ...overrides,
});

describe('exportToJSON / importFromJSON', () => {
    it('round-trips books through JSON export/import', () => {
        const books = [makeBook(), makeBook({ id: '2', isbn: '9780544003415', title: '1984' })];
        const json = exportToJSON(books);
        const imported = importFromJSON(json);
        expect(imported.books).toHaveLength(2);
        expect(imported.books[0].title).toBe('The Great Gatsby');
        expect(imported.books[1].title).toBe('1984');
    });

    it('includes version and export date in JSON', () => {
        const json = exportToJSON([makeBook()]);
        const parsed = JSON.parse(json);
        expect(parsed.version).toBe(2);
        expect(parsed.exportedAt).toBeDefined();
    });

    it('imports plain array format', () => {
        const books = [makeBook()];
        const json = JSON.stringify(books);
        const imported = importFromJSON(json);
        expect(imported.books).toHaveLength(1);
    });

    it('throws on invalid JSON format', () => {
        expect(() => importFromJSON('"just a string"')).toThrow();
    });

    it('preserves all fields', () => {
        const book = makeBook({ notes: 'Some notes', status: 'reading' });
        const json = exportToJSON([book]);
        const imported = importFromJSON(json);
        expect(imported.books[0].notes).toBe('Some notes');
        expect(imported.books[0].status).toBe('reading');
        expect(imported.books[0].pageCount).toBe(180);
    });
});

describe('exportToLibraryThingTSV', () => {
    it('generates TSV with headers', () => {
        const tsv = exportToLibraryThingTSV([]);
        expect(tsv).toContain('TITLE');
        expect(tsv).toContain('ISBN');
        expect(tsv).toContain('\t');
    });

    it('exports book data', () => {
        const tsv = exportToLibraryThingTSV([makeBook()]);
        const lines = tsv.split('\n');
        expect(lines).toHaveLength(2);
        expect(lines[1]).toContain('The Great Gatsby');
        expect(lines[1]).toContain('9780141036144');
    });

    it('replaces tabs in notes', () => {
        const tsv = exportToLibraryThingTSV([makeBook({ notes: "Line1\tLine2" })]);
        // Notes should not contain literal tabs (would break TSV)
        const dataLine = tsv.split('\n')[1];
        const fields = dataLine.split('\t');
        expect(fields[4]).not.toContain('\t');
    });
});

describe('exportToStoryGraphCSV', () => {
    it('generates CSV with headers', () => {
        const csv = exportToStoryGraphCSV([]);
        expect(csv).toContain('Title');
        expect(csv).toContain('Read Status');
    });

    it('maps reading statuses correctly', () => {
        const csv = exportToStoryGraphCSV([
            makeBook({ status: 'to-read' }),
            makeBook({ id: '2', status: 'reading', isbn: '1111111111' }),
            makeBook({ id: '3', status: 'read', isbn: '2222222222' }),
            makeBook({ id: '4', status: 'dnf', isbn: '3333333333' }),
        ]);
        expect(csv).toContain('to-read');
        expect(csv).toContain('currently-reading');
        expect(csv).toContain(',read,');
        expect(csv).toContain('did-not-finish');
    });

    it('escapes quotes in titles', () => {
        const csv = exportToStoryGraphCSV([makeBook({ title: 'A "Great" Book' })]);
        expect(csv).toContain('A ""Great"" Book');
    });

    it('handles empty library', () => {
        const csv = exportToStoryGraphCSV([]);
        const lines = csv.split('\n');
        expect(lines).toHaveLength(1); // headers only
        expect(lines[0]).toContain('Title');
    });
});

describe('exportToJSON – edge cases', () => {
    it('exports empty library as valid JSON', () => {
        const json = exportToJSON([]);
        const parsed = JSON.parse(json);
        expect(parsed.books).toEqual([]);
        expect(parsed.version).toBe(2);
    });

    it('exports and imports shelves', () => {
        const shelves = [{ id: 's1', name: 'Favorites', color: '#ff0000' }];
        const json = exportToJSON([makeBook()], shelves);
        const imported = importFromJSON(json);
        expect(imported.shelves).toHaveLength(1);
        expect(imported.shelves[0].name).toBe('Favorites');
    });

    it('handles books with missing optional fields', () => {
        const book = makeBook({
            notes: '',
            coverImg: '',
            amazonLink: '',
            pageCount: 0,
        });
        const json = exportToJSON([book]);
        const imported = importFromJSON(json);
        expect(imported.books[0].notes).toBe('');
        expect(imported.books[0].coverImg).toBe('');
        expect(imported.books[0].pageCount).toBe(0);
    });
});

describe('exportToLibraryThingTSV – edge cases', () => {
    it('handles empty library', () => {
        const tsv = exportToLibraryThingTSV([]);
        const lines = tsv.split('\n');
        expect(lines).toHaveLength(1); // headers only
    });

    it('handles books with empty notes and missing fields', () => {
        const book = makeBook({ notes: '', author: '', title: '' });
        const tsv = exportToLibraryThingTSV([book]);
        const lines = tsv.split('\n');
        expect(lines).toHaveLength(2);
        // Should still have correct number of tab-separated fields
        const fields = lines[1].split('\t');
        expect(fields).toHaveLength(7);
    });
});
