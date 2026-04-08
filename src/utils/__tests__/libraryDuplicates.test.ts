import { describe, expect, it } from 'vitest';
import { findDuplicateIsbnGroups } from '../libraryDuplicates.ts';
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

describe('findDuplicateIsbnGroups', () => {
  it('returns empty when no duplicates', () => {
    expect(findDuplicateIsbnGroups([base({ id: '1', isbn: '9780306406157' }), base({ id: '2', isbn: '9780141036144' })])).toEqual([]);
  });

  it('groups same canonical ISBN', () => {
    const books = [
      base({ id: 'a', isbn: '9780306406157', title: 'First' }),
      base({ id: 'b', isbn: '0306406152', title: 'Second' }),
    ];
    const groups = findDuplicateIsbnGroups(books);
    expect(groups).toHaveLength(1);
    expect(groups[0].books).toHaveLength(2);
  });

  it('ignores photo-only ids', () => {
    const books = [
      base({ id: 'p', isbn: 'photo-1', isPhotoOnly: true }),
      base({ id: 'q', isbn: 'photo-2', isPhotoOnly: true }),
    ];
    expect(findDuplicateIsbnGroups(books)).toEqual([]);
  });
});
