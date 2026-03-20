import { describe, it, expect } from 'vitest';
import { exportToJSON, exportToStoryGraphCSV } from '../exportFormats';
import type { BookEntry } from '../../types';

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'export-1',
  isbn: '9780141036144',
  title: '1984',
  author: 'George Orwell',
  pageCount: 328,
  amazonLink: 'https://amazon.com/s?k=9780141036144',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: '2026-01-15T00:00:00.000Z',
  shelfIds: [],
  ...overrides,
});

describe('Export formats – metadataSource field', () => {
  it('JSON export includes metadataSource when present', () => {
    const book = makeBook({ metadataSource: 'google_books' });
    const json = exportToJSON([book], []);
    const parsed = JSON.parse(json);
    expect(parsed.books[0].metadataSource).toBe('google_books');
  });

  it('JSON export includes userEditedFields when present', () => {
    const book = makeBook({ userEditedFields: ['title', 'author'] });
    const json = exportToJSON([book], []);
    const parsed = JSON.parse(json);
    expect(parsed.books[0].userEditedFields).toEqual(['title', 'author']);
  });

  it('JSON roundtrip preserves metadata quality fields', () => {
    const book = makeBook({
      metadataSource: 'open_library',
      userEditedFields: ['title'],
    });
    const json = exportToJSON([book], []);
    const parsed = JSON.parse(json);
    expect(parsed.books[0].metadataSource).toBe('open_library');
    expect(parsed.books[0].userEditedFields).toEqual(['title']);
  });

  it('CSV export still works with new fields', () => {
    const book = makeBook({ metadataSource: 'open_library' });
    const csv = exportToStoryGraphCSV([book]);
    expect(csv).toContain('9780141036144');
    expect(csv).toContain('1984');
  });
});
