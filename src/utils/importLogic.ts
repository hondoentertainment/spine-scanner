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
 * Imports books from a StoryGraph library export CSV.
 * Returns an ImportResult with counts of added, duplicates, and errors.
 */
export function importFromStoryGraphCSV(
    csv: string,
    existingBooks: BookEntry[],
    addBook: (book: BookEntry) => void,
): ImportResult {
    const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length < 2) return { added: 0, duplicates: 0, errors: [] };

    const rawHeaders = parseCSVLine(lines[0]);
    const headers = rawHeaders.map((h) => h.trim().toLowerCase());

    const col = (row: string[], name: string): string => {
        const idx = headers.indexOf(name.toLowerCase());
        return idx !== -1 ? (row[idx] ?? '').trim() : '';
    };

    // Pre-build lookup sets for duplicate detection
    const existingIsbns = new Set(existingBooks.filter((b) => b.isbn).map((b) => b.isbn));
    const existingTitleAuthor = new Set(
        existingBooks.map((b) => `${b.title.toLowerCase().trim()}|${b.author.toLowerCase().trim()}`),
    );

    // Track within-batch additions
    const batchIsbns = new Set<string>(existingIsbns);
    const batchTitleAuthor = new Set<string>(existingTitleAuthor);

    let added = 0;
    let duplicates = 0;
    const errors: string[] = [];

    for (const line of lines.slice(1)) {
        try {
            const row = parseCSVLine(line);

            const title = col(row, 'Title');
            if (!title) continue; // skip rows with no title

            const author = col(row, 'Authors');
            const isbn = col(row, 'ISBN/UID');
            const readStatusRaw = col(row, 'Read Status');
            const datesRead = col(row, 'Dates Read');
            const pageCountRaw = col(row, 'Page Count');
            const seriesRaw = col(row, 'Series');
            const starRatingRaw = col(row, 'Star Rating');

            // Duplicate detection
            const normalizedKey = `${title.toLowerCase().trim()}|${author.toLowerCase().trim()}`;
            if (isbn && batchIsbns.has(isbn)) { duplicates++; continue; }
            if (batchTitleAuthor.has(normalizedKey)) { duplicates++; continue; }

            // Map read status
            let status: BookEntry['status'];
            if (readStatusRaw === 'read') status = 'read';
            else if (readStatusRaw === 'currently-reading') status = 'reading';
            else if (readStatusRaw === 'did-not-finish') status = 'dnf';
            else status = 'to-read';

            // Parse dates — pipe-separated: first = startedAt, second = finishedAt
            let startedAt: string | null = null;
            let finishedAt: string | null = null;
            if (datesRead) {
                const parts = datesRead.split('|');
                if (parts[0]) {
                    const d = new Date(parts[0].trim());
                    if (!isNaN(d.getTime())) startedAt = d.toISOString();
                }
                if (parts[1]) {
                    const d = new Date(parts[1].trim());
                    if (!isNaN(d.getTime())) finishedAt = d.toISOString();
                }
            }

            // Parse seriesName — strip position suffix like "#1" if needed (keep as-is per spec)
            const seriesName = seriesRaw || undefined;

            const pageCount = parseInt(pageCountRaw, 10) || 0;
            const starRating = parseFloat(starRatingRaw) || 0;

            const entry: BookEntry = {
                id: crypto.randomUUID(),
                isbn: isbn || '',
                title,
                author: author || 'Unknown Author',
                pageCount,
                amazonLink: '',
                coverImg: '',
                status,
                notes: starRating ? `Rating: ${starRating}` : '',
                dateAdded: new Date().toISOString(),
                startedAt,
                finishedAt,
                shelfIds: [],
                metadataSource: 'manual',
                ...(seriesName !== undefined && { seriesName }),
            };

            addBook(entry);

            if (isbn) batchIsbns.add(isbn);
            batchTitleAuthor.add(normalizedKey);
            added++;
        } catch (err) {
            errors.push(err instanceof Error ? err.message : String(err));
        }
    }

    return { added, duplicates, errors };
}

/**
 * Validates file names for extra extensions.
 */
export const validateFileName = (fileName: string): { valid: boolean; warning?: string } => {
    if (fileName.endsWith('.csv.txt')) {
        return { valid: true, warning: 'This file has a .csv.txt extension. It will be treated as a text file.' };
    }
    return { valid: true };
};
