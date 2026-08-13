import type { BookEntry } from '../types.ts';

/**
 * Goodreads library export. Round-trips through `importFromGoodreadsCSV`:
 * uses Goodreads-native `="..."` ISBN wrappers, `Number of Pages`, `Exclusive Shelf`
 * (`to-read`/`currently-reading`/`read`), `Date Read` from `finishedAt`,
 * `Date Added` from `dateAdded`, `My Review` from `notes`.
 */

const HEADERS = [
    'Book Id', 'Title', 'Author', 'Author l-f', 'Additional Authors',
    'ISBN', 'ISBN13', 'My Rating', 'Average Rating',
    'Publisher', 'Binding', 'Number of Pages',
    'Year Published', 'Original Publication Year',
    'Date Read', 'Date Added',
    'Bookshelves', 'Bookshelves with positions',
    'Exclusive Shelf', 'My Review',
    'Spoiler', 'Private Notes',
    'Read Count', 'Owned Copies',
] as const;

const CRLF = '\r\n';

/** RFC 4180 field quoting: wrap and double-escape only when the value has ", , CR, or LF. */
function csvField(value: string | null | undefined): string {
    if (value == null) return '';
    const s = String(value);
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

/** ISO date -> YYYY-MM-DD. Empty on falsy or invalid input. */
function isoDateOnly(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
}

/** Goodreads-native ISBN cell: `="9780..."` — hack that stops Excel from re-formatting. */
function isbnCell(isbn: string | null | undefined): string {
    if (!isbn) return '';
    return `="${isbn}"`;
}

/** Goodreads has three exclusive shelves. `dnf` has no native equivalent; map to `read`. */
function exclusiveShelfFor(status: BookEntry['status']): string {
    switch (status) {
        case 'reading': return 'currently-reading';
        case 'to-read': return 'to-read';
        case 'read':
        case 'dnf':
            return 'read';
    }
}

/** Bookshelves column keeps the internal `dnf` marker so a round-trip preserves intent
 *  even though the exclusive-shelf channel can't. */
function bookshelvesFor(status: BookEntry['status']): string {
    return status === 'dnf' ? 'read, dnf' : exclusiveShelfFor(status);
}

export const exportToGoodreadsCSV = (books: BookEntry[]): string => {
    const rows = books.map((book) => [
        '', // Book Id — Goodreads-assigned; we don't have one
        csvField(book.title),
        csvField(book.author),
        '', // Author l-f
        '', // Additional Authors
        isbnCell(book.isbn),
        isbnCell(book.isbn),
        '', '', '', '',
        book.pageCount ? String(book.pageCount) : '',
        '', '',
        isoDateOnly(book.finishedAt),
        isoDateOnly(book.dateAdded),
        csvField(bookshelvesFor(book.status)),
        '', // Bookshelves with positions
        exclusiveShelfFor(book.status),
        csvField(book.notes),
        '', // Spoiler
        '', // Private Notes
        '', // Read Count
        '', // Owned Copies
    ]);

    return [HEADERS.join(','), ...rows.map((r) => r.join(','))].join(CRLF);
};
