import { describe, expect, it } from 'vitest';
import type { BookEntry } from '../../types';
import { filterLibraryBooks } from '../libraryFilter';
import { buildPhysicalShelfMap, formatPhysicalLocation } from '../physicalLocation';

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'b1',
  isbn: '9780141036144',
  title: 'Test Book',
  author: 'Test Author',
  pageCount: 200,
  amazonLink: '',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: '2026-01-15T00:00:00.000Z',
  shelfIds: [],
  ...overrides,
});

describe('filterLibraryBooks', () => {
  const books = [
    makeBook({
      id: 'study',
      title: 'Dune',
      status: 'reading',
      shelfIds: ['fiction'],
      locationRoom: 'Study',
      locationCase: 'Oak',
      locationShelf: '2',
    }),
    makeBook({
      id: 'hall',
      title: 'Neuromancer',
      status: 'read',
      shelfIds: ['fiction'],
      locationRoom: 'Hall',
      locationCase: 'Oak',
      locationShelf: '1',
    }),
    makeBook({
      id: 'loose',
      title: 'Kindred',
      status: 'reading',
      shelfIds: ['loaned'],
      locationRoom: 'Study',
      locationCase: 'Pine',
      locationShelf: '2',
    }),
    makeBook({ id: 'unplaced', title: 'Piranesi' }),
  ];

  it('returns every book when no location filter is set', () => {
    expect(filterLibraryBooks(books, {}).map((book) => book.id)).toEqual(['study', 'hall', 'loose', 'unplaced']);
  });

  it('filters by room, case, and shelf together with status and virtual shelf', () => {
    const matches = filterLibraryBooks(books, {
      status: 'reading',
      shelfId: 'fiction',
      locationRoom: 'study',
      locationCase: 'oak',
      locationShelf: '2',
    });
    expect(matches.map((book) => book.id)).toEqual(['study']);
  });

  it('matches a shelf label across cases until a case is chosen', () => {
    expect(filterLibraryBooks(books, { locationShelf: '2' }).map((book) => book.id)).toEqual(['study', 'loose']);
    expect(filterLibraryBooks(books, { locationRoom: 'Study', locationCase: 'Pine', locationShelf: '2' }).map((book) => book.id)).toEqual(['loose']);
  });

  it('treats an empty location filter as unassigned and finds placed books by location text', () => {
    expect(filterLibraryBooks(books, { locationRoom: '' }).map((book) => book.id)).toEqual(['unplaced']);
    expect(filterLibraryBooks(books, { searchTerm: 'oak' }).map((book) => book.id)).toEqual(['study', 'hall']);
    expect(filterLibraryBooks(books, { searchTerm: 'Shelf 2' }).map((book) => book.id)).toEqual(['study', 'loose']);
  });
});

describe('buildPhysicalShelfMap', () => {
  it('groups placed books by room, case, and shelf and skips unplaced copies', () => {
    const map = buildPhysicalShelfMap([
      makeBook({ id: 'a', locationRoom: 'Study', locationCase: 'Oak', locationShelf: '10' }),
      makeBook({ id: 'b', locationRoom: 'Study', locationCase: 'Oak', locationShelf: '2' }),
      makeBook({ id: 'c', locationRoom: 'Study', locationCase: 'Oak', locationShelf: '2' }),
      makeBook({ id: 'd', locationRoom: 'Hall', locationCase: '', locationShelf: 'Top' }),
      makeBook({ id: 'e' }),
    ]);

    expect(map.map((room) => room.label)).toEqual(['Hall', 'Study']);
    expect(map[1].count).toBe(3);
    expect(map[1].cases[0].label).toBe('Oak');
    expect(map[1].cases[0].shelves.map((shelf) => shelf.label)).toEqual(['Shelf 2', 'Shelf 10']);
    expect(map[1].cases[0].shelves[0].count).toBe(2);
    expect(map[0].cases[0].label).toBe('No case');
    expect(formatPhysicalLocation(makeBook({ locationRoom: 'Study', locationCase: 'Oak', locationShelf: '2' }))).toBe('Study · Oak · Shelf 2');
  });
});
