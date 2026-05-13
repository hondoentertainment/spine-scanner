import { describe, it, expect } from 'vitest';
import { exportToICS } from '../exportFormats';
import type { BookEntry } from '../../types';

function makeBook(overrides: Partial<BookEntry> = {}): BookEntry {
    return {
        id: 'test-id-1',
        isbn: '9780000000001',
        title: 'Test Book',
        author: 'Test Author',
        pageCount: 300,
        amazonLink: '',
        coverImg: '',
        status: 'read',
        notes: '',
        dateAdded: '2024-01-01T00:00:00.000Z',
        finishedAt: '2024-03-15T00:00:00.000Z',
        shelfIds: [],
        ...overrides,
    };
}

describe('exportToICS', () => {
    it('generates a valid VCALENDAR header and footer', () => {
        const ics = exportToICS([]);
        expect(ics).toContain('BEGIN:VCALENDAR\r\n');
        expect(ics).toContain('VERSION:2.0\r\n');
        expect(ics).toContain('PRODID:-//SpineScanner//EN\r\n');
        expect(ics).toContain('CALSCALE:GREGORIAN\r\n');
        expect(ics).toContain('METHOD:PUBLISH\r\n');
        expect(ics).toContain('END:VCALENDAR\r\n');
    });

    it('generates one VEVENT per finished book', () => {
        const books = [
            makeBook({ id: 'id-1', title: 'Book One', finishedAt: '2024-01-10T00:00:00.000Z' }),
            makeBook({ id: 'id-2', title: 'Book Two', finishedAt: '2024-02-20T00:00:00.000Z' }),
        ];
        const ics = exportToICS(books);
        const veventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
        expect(veventCount).toBe(2);
    });

    it('formats DTSTART correctly as YYYYMMDD', () => {
        const book = makeBook({ finishedAt: '2024-03-15T00:00:00.000Z' });
        const ics = exportToICS([book]);
        expect(ics).toContain('DTSTART;VALUE=DATE:20240315');
    });

    it('sets DTEND to finishedAt + 1 day', () => {
        const book = makeBook({ finishedAt: '2024-03-15T00:00:00.000Z' });
        const ics = exportToICS([book]);
        expect(ics).toContain('DTEND;VALUE=DATE:20240316');
    });

    it('uses book.id as UID', () => {
        const book = makeBook({ id: 'my-unique-id' });
        const ics = exportToICS([book]);
        expect(ics).toContain('UID:my-unique-id@spinescanner');
    });

    it('includes SUMMARY with "Finished: {title}"', () => {
        const book = makeBook({ title: 'Project Hail Mary' });
        const ics = exportToICS([book]);
        expect(ics).toContain('SUMMARY:Finished: Project Hail Mary');
    });

    it('includes DESCRIPTION with author and page count', () => {
        const book = makeBook({ author: 'Andy Weir', pageCount: 476 });
        const ics = exportToICS([book]);
        expect(ics).toContain('DESCRIPTION:by Andy Weir. 476 pages.');
    });

    it('skips books without finishedAt', () => {
        const books = [
            makeBook({ finishedAt: null }),
            makeBook({ finishedAt: undefined }),
            makeBook({ finishedAt: '2024-05-01T00:00:00.000Z' }),
        ];
        const ics = exportToICS(books);
        const veventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
        expect(veventCount).toBe(1);
    });

    it('skips books with invalid finishedAt date strings', () => {
        const books = [
            makeBook({ finishedAt: 'not-a-date' }),
            makeBook({ finishedAt: '2024-06-01T00:00:00.000Z' }),
        ];
        const ics = exportToICS(books);
        const veventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
        expect(veventCount).toBe(1);
    });

    it('escapes commas in SUMMARY', () => {
        const book = makeBook({ title: 'Hello, World' });
        const ics = exportToICS([book]);
        expect(ics).toContain('SUMMARY:Finished: Hello\\, World');
    });

    it('escapes semicolons in SUMMARY', () => {
        const book = makeBook({ title: 'A; B' });
        const ics = exportToICS([book]);
        expect(ics).toContain('SUMMARY:Finished: A\\; B');
    });

    it('escapes backslashes in SUMMARY', () => {
        const book = makeBook({ title: 'A\\B' });
        const ics = exportToICS([book]);
        expect(ics).toContain('SUMMARY:Finished: A\\\\B');
    });

    it('escapes newlines in DESCRIPTION', () => {
        const book = makeBook({ author: 'Line1\nLine2' });
        const ics = exportToICS([book]);
        expect(ics).toContain('by Line1\\nLine2');
    });

    it('folds lines longer than 75 octets', () => {
        // Create a title long enough to push SUMMARY past 75 chars
        const longTitle = 'A'.repeat(80);
        const book = makeBook({ title: longTitle });
        const ics = exportToICS([book]);

        // Every CRLF-separated line (before folded continuations) must be <= 75 octets
        const rawLines = ics.split('\r\n');
        for (const line of rawLines) {
            // Continuation lines start with a space — count the space in the byte limit
            const byteLength = new TextEncoder().encode(line).length;
            expect(byteLength).toBeLessThanOrEqual(75);
        }
    });

    it('returns empty calendar (no events) when no books are finished', () => {
        const books = [
            makeBook({ status: 'to-read', finishedAt: null }),
            makeBook({ status: 'reading', finishedAt: null }),
        ];
        const ics = exportToICS(books);
        expect(ics).not.toContain('BEGIN:VEVENT');
        expect(ics).toContain('END:VCALENDAR');
    });

    it('uses CRLF line endings throughout', () => {
        const book = makeBook();
        const ics = exportToICS([book]);
        // Strip all CRLF and check no lone LF remain
        const withoutCRLF = ics.replace(/\r\n/g, '');
        expect(withoutCRLF).not.toContain('\n');
        expect(withoutCRLF).not.toContain('\r');
    });
});
