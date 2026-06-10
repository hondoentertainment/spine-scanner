import type { BookEntry, ProfilePreferences, Shelf } from '../types.ts';
import { normalizeBookEntry } from './bookState.ts';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const exportToJSON = (books: BookEntry[], shelves: Shelf[] = []): string => {
  return JSON.stringify({ version: 3, exportedAt: new Date().toISOString(), books, shelves }, null, 2);
};

/** Full account snapshot including preferences (for portability / data requests). */
export const exportAccountSnapshot = (
  books: BookEntry[],
  shelves: Shelf[],
  preferences: ProfilePreferences,
): string =>
  JSON.stringify(
    {
      version: 3,
      exportedAt: new Date().toISOString(),
      books,
      shelves,
      preferences,
    },
    null,
    2,
  );

export const exportToHTML = (books: BookEntry[], shelves: Shelf[] = []): string => {
  const title = 'SpineScanner library export';
  const rows = books
    .map(
      (b) =>
        `<tr><td>${escapeHtml(b.title)}</td><td>${escapeHtml(b.author)}</td><td>${escapeHtml(b.isbn)}</td>`
        + `<td>${escapeHtml(b.status)}</td><td>${b.pageCount || 0}</td><td>${escapeHtml((b.notes || '').slice(0, 500))}</td></tr>`,
    )
    .join('\n');
  const shelfRows = shelves
    .map((sh) => `<li>${escapeHtml(sh.name)} <span style="color:#666">(${escapeHtml(sh.color)})</span></li>`)
    .join('\n');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>`
    + `<style>body{font-family:system-ui,sans-serif;margin:2rem;background:#f8fafc;color:#0f172a}`
    + `table{border-collapse:collapse;width:100%;background:#fff} th,td{border:1px solid #e2e8f0;padding:.5rem .65rem;text-align:left}`
    + `th{background:#1e293b;color:#f8fafc}</style></head><body>`
    + `<h1>${escapeHtml(title)}</h1><p>Exported ${escapeHtml(new Date().toISOString())}</p>`
    + `<h2>Books (${books.length})</h2><table><thead><tr><th>Title</th><th>Author</th><th>ISBN</th><th>Status</th><th>Pages</th><th>Notes (trimmed)</th></tr></thead><tbody>${rows}</tbody></table>`
    + `<h2>Shelves</h2><ul>${shelfRows || '<li>(none)</li>'}</ul></body></html>`;
};

export const importFromJSON = (json: string): { books: BookEntry[]; shelves: Shelf[] } => {
    const data = JSON.parse(json);
    if (Array.isArray(data)) {
        return { books: data.map((book) => normalizeBookEntry({ ...book, shelfIds: book.shelfIds || [] })), shelves: [] };
    }
    if (data.books && Array.isArray(data.books)) {
        const books = data.books.map((book: BookEntry) => normalizeBookEntry({ ...book, shelfIds: book.shelfIds || [] }));
        const shelves = Array.isArray(data.shelves) ? data.shelves : [];
        return { books, shelves };
    }
    throw new Error('Invalid JSON format: expected an array of books or { books: [...] }');
};

export const exportToLibraryThingTSV = (books: BookEntry[]): string => {
    const headers = ['TITLE', 'AUTHOR (first, last)', 'ISBN', 'RATING', 'COMMENT', 'TAGS', 'DATE ADDED'];
    const rows = books.map(book => [
        book.title,
        book.author,
        book.isbn,
        '',
        book.notes.replace(/\t/g, ' '),
        book.status,
        book.dateAdded.split('T')[0],
    ]);
    return [headers.join('\t'), ...rows.map(row => row.join('\t'))].join('\n');
};

/**
 * Escapes text field values per RFC 5545 §3.3.11:
 * backslash, comma, semicolon, and newlines must be escaped.
 */
function escapeICSText(text: string): string {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Folds a single ICS property line so that no encoded line exceeds 75 octets,
 * inserting CRLF + SPACE continuation per RFC 5545 §3.1.
 */
function foldLine(line: string): string {
    // Work in UTF-8 bytes; split on byte boundaries where possible.
    const encoder = new TextEncoder();
    const bytes = encoder.encode(line);
    if (bytes.length <= 75) return line;

    const decoder = new TextDecoder();
    const parts: string[] = [];
    let offset = 0;

    while (offset < bytes.length) {
        const limit = offset === 0 ? 75 : 74; // first line 75, continuations 74 (1 byte for leading space)
        let end = offset + limit;
        if (end >= bytes.length) {
            parts.push(decoder.decode(bytes.slice(offset)));
            break;
        }
        // Don't split in the middle of a multi-byte UTF-8 sequence
        while (end > offset && (bytes[end] & 0xc0) === 0x80) end--;
        parts.push(decoder.decode(bytes.slice(offset, end)));
        offset = end;
    }

    return parts.join('\r\n ');
}

/**
 * Formats a Date or ISO string to YYYYMMDD.
 */
function toYYYYMMDD(dateStr: string): string {
    const d = new Date(dateStr);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}${m}${day}`;
}

/**
 * Returns YYYYMMDD for finishedAt + 1 day (exclusive end per RFC 5545).
 */
function toYYYYMMDDPlusOne(dateStr: string): string {
    const d = new Date(dateStr);
    d.setUTCDate(d.getUTCDate() + 1);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}${m}${day}`;
}

/**
 * Generates a valid RFC 5545 .ics calendar string with one VEVENT per finished book.
 */
export function exportToICS(books: BookEntry[]): string {
    const finishedBooks = books.filter((b) => {
        if (!b.finishedAt) return false;
        const d = new Date(b.finishedAt);
        return !isNaN(d.getTime());
    });

    const lines: string[] = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//SpineScanner//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
    ];

    for (const book of finishedBooks) {
        const dtstart = toYYYYMMDD(book.finishedAt!);
        const dtend = toYYYYMMDDPlusOne(book.finishedAt!);
        const summary = escapeICSText(`Finished: ${book.title}`);
        const description = escapeICSText(
            `by ${book.author}. ${book.pageCount || 0} pages.`,
        );

        lines.push('BEGIN:VEVENT');
        lines.push(foldLine(`UID:${book.id}@spinescanner`));
        lines.push(foldLine(`DTSTART;VALUE=DATE:${dtstart}`));
        lines.push(foldLine(`DTEND;VALUE=DATE:${dtend}`));
        lines.push(foldLine(`SUMMARY:${summary}`));
        lines.push(foldLine(`DESCRIPTION:${description}`));
        lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');

    return lines.join('\r\n') + '\r\n';
}

export const exportToStoryGraphCSV = (books: BookEntry[]): string => {
    const headers = ['Title', 'Authors', 'ISBN/UID', 'Star Rating', 'Read Status', 'Review', 'Tags'];
    const statusMap: Record<string, string> = {
        'to-read': 'to-read',
        'reading': 'currently-reading',
        'read': 'read',
        'dnf': 'did-not-finish',
    };
    const rows = books.map(book => [
        `"${book.title.replace(/"/g, '""')}"`,
        `"${book.author.replace(/"/g, '""')}"`,
        book.isbn,
        '',
        statusMap[book.status] || book.status,
        `"${book.notes.replace(/"/g, '""')}"`,
        '',
    ]);
    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
};

/**
 * Escapes a single CSV cell value. Wraps the value in double quotes when it
 * contains a comma, double quote, CR, or LF, doubling any embedded quotes.
 */
function escapeCsvCell(value: string): string {
    if (value === '') return '';
    if (/[",\r\n]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

/**
 * Converts an ISO date string (or any Date-parseable string) to YYYY-MM-DD in UTC.
 * Returns an empty string when the input is missing or unparseable.
 */
function toYYYYDashMMDashDD(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

const NOTION_STATUS_MAP: Record<BookEntry['status'], string> = {
    'to-read': 'To Read',
    'reading': 'Reading',
    'read': 'Read',
    'dnf': 'DNF',
};

/**
 * Generates a Notion-compatible CSV string for importing the library into a
 * Notion database. Columns are mapped by header name; rows use CRLF endings.
 */
export const exportToNotionCSV = (books: BookEntry[]): string => {
    const headers = [
        'Title',
        'Author',
        'ISBN',
        'Status',
        'Pages',
        'Pages Read',
        'Started',
        'Finished',
        'Series',
        'Series #',
        'Notes',
        'Date Added',
    ];

    const rows = books.map((book) => {
        const notes = (book.notes ?? '').replace(/\r\n|\r|\n/g, ' / ');
        const cells = [
            book.title ?? '',
            book.author ?? '',
            book.isbn ?? '',
            NOTION_STATUS_MAP[book.status] ?? '',
            book.pageCount != null ? String(book.pageCount) : '',
            String(book.pagesFinished ?? 0),
            toYYYYDashMMDashDD(book.startedAt),
            toYYYYDashMMDashDD(book.finishedAt),
            book.seriesName ?? '',
            book.seriesIndex != null ? String(book.seriesIndex) : '',
            notes,
            toYYYYDashMMDashDD(book.dateAdded),
        ];
        return cells.map(escapeCsvCell).join(',');
    });

    return [headers.join(','), ...rows].join('\r\n');
};
