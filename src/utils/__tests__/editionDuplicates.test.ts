import { describe, expect, it } from 'vitest';
import {
  findEditionDuplicateGroups,
  normalizeForMatching,
} from '../editionDuplicates.ts';
import type { BookEntry } from '../../types.ts';

const base = (overrides: Partial<BookEntry>): BookEntry => ({
  id: 'x',
  isbn: '9780000000000',
  title: 'T',
  author: 'A',
  pageCount: 0,
  amazonLink: '',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: new Date().toISOString(),
  shelfIds: [],
  ...overrides,
});

describe('normalizeForMatching', () => {
  it('strips diacritics so accented forms match plain forms', () => {
    expect(normalizeForMatching('Les Misérables')).toBe(
      normalizeForMatching('Les Miserables'),
    );
  });

  it('strips parenthetical edition descriptors', () => {
    expect(normalizeForMatching('The Hobbit (Anniversary Edition)')).toBe(
      normalizeForMatching('The Hobbit'),
    );
  });

  it('drops trailing edition suffix tokens', () => {
    expect(normalizeForMatching('Dune: Revised Edition')).toBe(
      normalizeForMatching('Dune'),
    );
  });
});

describe('findEditionDuplicateGroups', () => {
  it('groups two books with same title+author but different ISBNs', () => {
    const books = [
      base({ id: 'a', isbn: '9780000000001', title: 'Dune', author: 'Frank Herbert' }),
      base({ id: 'b', isbn: '9780000000002', title: 'Dune', author: 'Frank Herbert' }),
    ];
    const groups = findEditionDuplicateGroups(books);
    expect(groups).toHaveLength(1);
    expect(groups[0].books.map((b) => b.id).sort()).toEqual(['a', 'b']);
  });

  it('does not group books that share the same exact ISBN', () => {
    const books = [
      base({ id: 'a', isbn: '9780000000001', title: 'Dune', author: 'Frank Herbert' }),
      base({ id: 'b', isbn: '9780000000001', title: 'Dune', author: 'Frank Herbert' }),
    ];
    expect(findEditionDuplicateGroups(books)).toEqual([]);
  });

  it('treats edition-suffix variants as the same title', () => {
    const books = [
      base({
        id: 'a',
        isbn: '9780000000001',
        title: 'The Hobbit (Anniversary Edition)',
        author: 'J.R.R. Tolkien',
      }),
      base({
        id: 'b',
        isbn: '9780000000002',
        title: 'The Hobbit',
        author: 'J.R.R. Tolkien',
      }),
    ];
    const groups = findEditionDuplicateGroups(books);
    expect(groups).toHaveLength(1);
    expect(groups[0].books).toHaveLength(2);
  });

  it('treats diacritic variants as matches', () => {
    const books = [
      base({
        id: 'a',
        isbn: '9780000000001',
        title: 'Les Misérables',
        author: 'Victor Hugo',
      }),
      base({
        id: 'b',
        isbn: '9780000000002',
        title: 'Les Miserables',
        author: 'Victor Hugo',
      }),
    ];
    const groups = findEditionDuplicateGroups(books);
    expect(groups).toHaveLength(1);
    expect(groups[0].books).toHaveLength(2);
  });

  it('does not group books with same title but different authors', () => {
    const books = [
      base({
        id: 'a',
        isbn: '9780000000001',
        title: 'The Lost World',
        author: 'Arthur Conan Doyle',
      }),
      base({
        id: 'b',
        isbn: '9780000000002',
        title: 'The Lost World',
        author: 'Michael Crichton',
      }),
    ];
    expect(findEditionDuplicateGroups(books)).toEqual([]);
  });

  it('omits singletons that have no matching partner', () => {
    const books = [
      base({ id: 'a', isbn: '9780000000001', title: 'A Lonely Book', author: 'Nobody' }),
    ];
    expect(findEditionDuplicateGroups(books)).toEqual([]);
  });

  it('excludes photo-only entries', () => {
    const books = [
      base({ id: 'p1', isbn: 'photo-1', isPhotoOnly: true, title: 'Dune', author: 'Frank Herbert' }),
      base({ id: 'p2', isbn: 'photo-2', isPhotoOnly: true, title: 'Dune', author: 'Frank Herbert' }),
    ];
    expect(findEditionDuplicateGroups(books)).toEqual([]);
  });
});
