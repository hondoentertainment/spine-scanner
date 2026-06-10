import { describe, it, expect } from 'vitest';
import { exportToNotionCSV } from '../exportFormats';
import type { BookEntry } from '../../types';

const HEADER_ROW =
    'Title,Author,ISBN,Status,Pages,Pages Read,Started,Finished,Series,Series #,Notes,Date Added';

function makeBook(overrides: Partial<BookEntry> = {}): BookEntry {
    return {
        id: 'id-1',
        isbn: '9780000000001',
        title: 'Test Book',
        author: 'Test Author',
        pageCount: 300,
        amazonLink: '',
        coverImg: '',
        status: 'read',
        notes: '',
        dateAdded: '2024-01-01T00:00:00.000Z',
        shelfIds: [],
        ...overrides,
    };
}

describe('exportToNotionCSV', () => {
    it('returns just the header row for an empty book list', () => {
        const csv = exportToNotionCSV([]);
        expect(csv).toBe(HEADER_ROW);
    });

    it('uses CRLF line endings between rows', () => {
        const csv = exportToNotionCSV([makeBook()]);
        expect(csv.startsWith(`${HEADER_ROW}\r\n`)).toBe(true);
        // No bare LF except as part of CRLF
        expect(csv.replace(/\r\n/g, '')).not.toContain('\n');
    });

    it('emits a header row with all expected columns in order', () => {
        const csv = exportToNotionCSV([]);
        const headers = csv.split('\r\n')[0];
        expect(headers).toBe(HEADER_ROW);
    });

    it('maps every status value to its Notion-friendly label', () => {
        const books: BookEntry[] = [
            makeBook({ id: 'a', status: 'to-read' }),
            makeBook({ id: 'b', status: 'reading' }),
            makeBook({ id: 'c', status: 'read' }),
            makeBook({ id: 'd', status: 'dnf' }),
        ];
        const csv = exportToNotionCSV(books);
        const rows = csv.split('\r\n').slice(1);
        expect(rows[0].split(',')[3]).toBe('To Read');
        expect(rows[1].split(',')[3]).toBe('Reading');
        expect(rows[2].split(',')[3]).toBe('Read');
        expect(rows[3].split(',')[3]).toBe('DNF');
    });

    it('converts ISO date strings to YYYY-MM-DD', () => {
        const csv = exportToNotionCSV([
            makeBook({
                dateAdded: '2024-03-15T12:34:56.000Z',
                startedAt: '2024-04-01T00:00:00.000Z',
                finishedAt: '2024-04-10T23:59:59.000Z',
            }),
        ]);
        const cells = csv.split('\r\n')[1].split(',');
        // cells: Title, Author, ISBN, Status, Pages, Pages Read, Started, Finished, Series, Series #, Notes, Date Added
        expect(cells[6]).toBe('2024-04-01'); // Started
        expect(cells[7]).toBe('2024-04-10'); // Finished
        expect(cells[11]).toBe('2024-03-15'); // Date Added
    });

    it('produces empty cells for missing optional fields', () => {
        const csv = exportToNotionCSV([
            makeBook({
                startedAt: null,
                finishedAt: null,
                seriesName: undefined,
                seriesIndex: undefined,
                pagesFinished: undefined,
            }),
        ]);
        const cells = csv.split('\r\n')[1].split(',');
        expect(cells[5]).toBe('0'); // Pages Read defaults to 0
        expect(cells[6]).toBe(''); // Started
        expect(cells[7]).toBe(''); // Finished
        expect(cells[8]).toBe(''); // Series
        expect(cells[9]).toBe(''); // Series #
    });

    it('preserves pagesFinished, seriesName, and seriesIndex when present', () => {
        const csv = exportToNotionCSV([
            makeBook({
                pagesFinished: 142,
                seriesName: 'The Expanse',
                seriesIndex: 3,
            }),
        ]);
        const cells = csv.split('\r\n')[1].split(',');
        expect(cells[5]).toBe('142');
        expect(cells[8]).toBe('The Expanse');
        expect(cells[9]).toBe('3');
    });

    it('escapes commas by wrapping the cell in double quotes', () => {
        const csv = exportToNotionCSV([
            makeBook({ title: 'Hello, World', author: 'Smith, John' }),
        ]);
        const row = csv.split('\r\n')[1];
        expect(row).toContain('"Hello, World"');
        expect(row).toContain('"Smith, John"');
    });

    it('escapes double quotes by doubling them and wrapping the cell', () => {
        const csv = exportToNotionCSV([makeBook({ title: 'A "Great" Book' })]);
        const row = csv.split('\r\n')[1];
        expect(row).toContain('"A ""Great"" Book"');
    });

    it('flattens newlines in notes to " / " separators', () => {
        const csv = exportToNotionCSV([
            makeBook({ notes: 'First line\nSecond line\r\nThird line' }),
        ]);
        // After newline flattening the notes field has no commas or quotes,
        // so it should appear unquoted.
        expect(csv).toContain('First line / Second line / Third line');
        // And there should be no embedded LF in the cell.
        const noteCell = csv.split('\r\n')[1].split(',')[10];
        expect(noteCell).not.toContain('\n');
        expect(noteCell).not.toContain('\r');
    });

    it('escapes embedded quotes in notes', () => {
        const csv = exportToNotionCSV([
            makeBook({ notes: 'He said "hello" loudly' }),
        ]);
        expect(csv).toContain('"He said ""hello"" loudly"');
    });

    it('produces one data row per book in order', () => {
        const books: BookEntry[] = [
            makeBook({ id: 'a', title: 'Book A' }),
            makeBook({ id: 'b', title: 'Book B' }),
            makeBook({ id: 'c', title: 'Book C' }),
        ];
        const csv = exportToNotionCSV(books);
        const rows = csv.split('\r\n');
        expect(rows).toHaveLength(4); // header + 3 books
        expect(rows[1].startsWith('Book A,')).toBe(true);
        expect(rows[2].startsWith('Book B,')).toBe(true);
        expect(rows[3].startsWith('Book C,')).toBe(true);
    });

    it('returns empty Date Added when dateAdded is unparseable', () => {
        const csv = exportToNotionCSV([makeBook({ dateAdded: 'not-a-date' })]);
        const cells = csv.split('\r\n')[1].split(',');
        expect(cells[11]).toBe('');
    });
});
