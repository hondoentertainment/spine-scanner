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
