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
 * Validates file names for extra extensions.
 */
export const validateFileName = (fileName: string): { valid: boolean; warning?: string } => {
    if (fileName.endsWith('.csv.txt')) {
        return { valid: true, warning: 'This file has a .csv.txt extension. It will be treated as a text file.' };
    }
    return { valid: true };
};
