import type { BookEntry, Shelf } from '../types.ts';

export const exportToJSON = (books: BookEntry[], shelves: Shelf[] = []): string => {
    return JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), books, shelves }, null, 2);
};

export const importFromJSON = (json: string): { books: BookEntry[]; shelves: Shelf[] } => {
    const data = JSON.parse(json);
    if (Array.isArray(data)) {
        return { books: data.map((book) => ({ ...book, shelfIds: book.shelfIds || [] })), shelves: [] };
    }
    if (data.books && Array.isArray(data.books)) {
        const books = data.books.map((book: BookEntry) => ({ ...book, shelfIds: book.shelfIds || [] }));
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
