import { describe, it, expect } from 'vitest';
import { exportToGoodreadsCSV } from '../goodreadsExport';
import type { BookEntry } from '../../types';

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: '1',
  isbn: '9780141036144',
  title: 'The Great Gatsby',
  author: 'F. Scott Fitzgerald',
  pageCount: 180,
  amazonLink: 'https://amazon.com/s?k=9780141036144',
  coverImg: 'https://example.com/cover.jpg',
  status: 'read',
  notes: '',
  dateAdded: '2025-01-15T00:00:00.000Z',
  ...overrides,
});

describe('exportToGoodreadsCSV', () => {
  it('generates CSV with headers', () => {
    const csv = exportToGoodreadsCSV([]);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Title');
    expect(lines[0]).toContain('Author');
    expect(lines[0]).toContain('ISBN');
  });

  it('exports book data correctly', () => {
    const csv = exportToGoodreadsCSV([makeBook()]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('The Great Gatsby');
    expect(lines[1]).toContain('F. Scott Fitzgerald');
    expect(lines[1]).toContain('9780141036144');
  });

  it('escapes double quotes in titles', () => {
    const csv = exportToGoodreadsCSV([makeBook({ title: 'A "Great" Book' })]);
    expect(csv).toContain('A ""Great"" Book');
  });

  it('includes date read for read books', () => {
    const csv = exportToGoodreadsCSV([makeBook({ status: 'read' })]);
    const lines = csv.split('\n');
    // Date Read column should have today's date
    expect(lines[1]).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('includes notes in My Review column', () => {
    const csv = exportToGoodreadsCSV([makeBook({ notes: 'Wonderful book' })]);
    expect(csv).toContain('Wonderful book');
  });

  it('exports multiple books', () => {
    const books = [
      makeBook({ id: '1', title: 'Book One' }),
      makeBook({ id: '2', title: 'Book Two', isbn: '9780544003415' }),
    ];
    const csv = exportToGoodreadsCSV(books);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3); // header + 2 books
  });
});
