import type { BookEntry } from '../types.ts';

export interface ImportResult {
    added: number;
    duplicates: number;
    errors: string[];
}

/**
 * Parses a CSV string and returns an array of BookEntry-like objects (minimal ISBN required).
 * Handles quoted fields and common CSV variations.
 */
export const parseCSV = (csv: string): Partial<BookEntry>[] => {
    const lines = csv.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const isbnIdx = headers.findIndex(h => h.toLowerCase() === 'isbn' || h.toLowerCase() === 'id');

    if (isbnIdx === -1) return [];

    return lines.slice(1).map(line => {
        // Basic regex for CSV splitting with quotes
        const matches = line.match(/(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^",]*))/g);
        if (!matches) return {};

        const values = matches.map(m => {
            let val = m.replace(/^,/, '');
            if (val.startsWith('"') && val.endsWith('"')) {
                val = val.substring(1, val.length - 1).replace(/""/g, '"');
            }
            return val.trim();
        });

        return {
            isbn: values[isbnIdx] || '',
            title: values[headers.findIndex(h => h.toLowerCase() === 'title')] || '',
            author: values[headers.findIndex(h => h.toLowerCase() === 'author')] || '',
            status: (values[headers.findIndex(h => h.toLowerCase() === 'bookshelves')] as BookEntry['status']) || 'read',
            notes: values[headers.findIndex(h => h.toLowerCase() === 'my review')] || '',
        };
    }).filter(b => b.isbn && b.isbn.length >= 10);
};

/**
 * Extracts ISBNs from a raw string (HTML source or text).
 */
export const extractISBNs = (text: string): string[] => {
    const isbnRegex = /(?:ISBN(?:-1[03])?:? )?((?=[0-9X]{10}$|(?=(?:[0-9]+[- ]){3})[- 0-9X]{13}$|97[89][0-9]{10}$|(?=(?:[0-9]+[- ]){4})[- 0-9]{17}$)(?:97[89][- ]?)?[0-9]{1,5}[- ]?[0-9]+[- ]?[0-9]+[- ]?[0-9X])/g;
    const matches = text.match(isbnRegex) || [];
    return [...new Set(matches.map(m => m.replace(/[^0-9X]/g, '')))];
};

/**
 * Parses a single CSV line into an array of field strings,
 * correctly handling quoted fields with embedded commas and escaped quotes.
 */
const parseCSVLine = (line: string): string[] => {
    const fields: string[] = [];
    let i = 0;
    while (i < line.length) {
        if (line[i] === '"') {
            // Quoted field
            let val = '';
            i++; // skip opening quote
            while (i < line.length) {
                if (line[i] === '"' && line[i + 1] === '"') {
                    val += '"';
                    i += 2;
                } else if (line[i] === '"') {
                    i++; // skip closing quote
                    break;
                } else {
                    val += line[i++];
                }
            }
            fields.push(val);
            // skip comma separator
            if (i < line.length && line[i] === ',') i++;
        } else {
            // Unquoted field
            const end = line.indexOf(',', i);
            if (end === -1) {
                fields.push(line.slice(i).trim());
                break;
            } else {
                fields.push(line.slice(i, end).trim());
                i = end + 1;
            }
        }
    }
    // Handle trailing comma
    if (line.endsWith(',')) fields.push('');
    return fields;
};

/**
 * Strips the Goodreads `="..."` ISBN wrapper.
 */
const stripIsbnWrapper = (raw: string): string =>
    raw.replace(/^="?/, '').replace(/"?$/, '').replace(/"/g, '').trim();

/**
 * Imports books from a Goodreads library export CSV.
 * Returns new BookEntry objects (not yet added to store) and a count of skipped duplicates.
 */
export const importFromGoodreadsCSV = (
    csvText: string,
    existingBooks: BookEntry[],
): { imported: BookEntry[]; skipped: number } => {
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length < 2) return { imported: [], skipped: 0 };

    const headers = parseCSVLine(lines[0]).map((h) => h.trim());

    const col = (row: string[], name: string): string => {
        const idx = headers.indexOf(name);
        return idx !== -1 ? (row[idx] ?? '').trim() : '';
    };

    const imported: BookEntry[] = [];
    let skipped = 0;

    // Track ISBNs added in this import to avoid intra-batch duplicates
    const addedIsbns = new Set(existingBooks.map((b) => b.isbn));

    for (const line of lines.slice(1)) {
        const row = parseCSVLine(line);

        // Prefer ISBN13, fall back to ISBN
        const rawIsbn13 = col(row, 'ISBN13');
        const rawIsbn = col(row, 'ISBN');
        const isbn = stripIsbnWrapper(rawIsbn13) || stripIsbnWrapper(rawIsbn);

        if (!isbn) { skipped++; continue; }

        if (addedIsbns.has(isbn)) { skipped++; continue; }

        const shelfRaw = col(row, 'Exclusive Shelf');
        let status: BookEntry['status'];
        if (shelfRaw === 'read') status = 'read';
        else if (shelfRaw === 'currently-reading') status = 'reading';
        else status = 'to-read';

        const dateReadRaw = col(row, 'Date Read');
        const dateAddedRaw = col(row, 'Date Added');

        const entry: BookEntry = {
            id: crypto.randomUUID(),
            isbn,
            title: col(row, 'Title') || 'Unknown Title',
            author: col(row, 'Author') || 'Unknown Author',
            pageCount: parseInt(col(row, 'Number of Pages'), 10) || 0,
            amazonLink: '',
            coverImg: '',
            status,
            notes: col(row, 'My Review'),
            dateAdded: dateAddedRaw ? new Date(dateAddedRaw).toISOString() : new Date().toISOString(),
            finishedAt: dateReadRaw ? new Date(dateReadRaw).toISOString() : null,
            shelfIds: [],
            metadataSource: 'manual',
        };

        imported.push(entry);
        addedIsbns.add(isbn);
    }

    return { imported, skipped };
};

/**
 * Validates file names for extra extensions.
 */
export const validateFileName = (fileName: string): { valid: boolean; warning?: string } => {
    if (fileName.endsWith('.csv.txt')) {
        return { valid: true, warning: 'This file has a .csv.txt extension. It will be treated as a text file.' };
    }
    return { valid: true };
};
