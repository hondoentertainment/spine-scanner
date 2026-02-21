import type { BookEntry } from '../types.ts';

export const exportToGoodreadsCSV = (books: BookEntry[]): string => {
    const headers = [
        'Title', 'Author', 'ISBN', 'My Rating', 'Average Rating',
        'Publisher', 'Binding', 'Year Published', 'Original Publication Year',
        'Date Read', 'Date Added', 'Bookshelves', 'My Review'
    ];

    const rows = books.map(book => [
        `"${book.title.replace(/"/g, '""')}"`,
        `"${book.author.replace(/"/g, '""')}"`,
        `"${book.isbn}"`,
        book.rating != null ? String(book.rating) : '',
        '', '', '', '', '',
        book.dateFinished
            ? book.dateFinished.split('T')[0]
            : book.status === 'read'
            ? new Date().toISOString().split('T')[0]
            : '',
        book.dateAdded.split('T')[0],
        book.status,
        `"${book.notes.replace(/"/g, '""')}"`
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
};
