import { describe, it, expect } from 'vitest';
import { isPhotoId, isBookPhotoOnly, isbnExistsInLibrary } from '../libraryUtils';
import type { BookEntry } from '../../types';

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'b1',
  isbn: '9780141036144',
  title: 'Test',
  author: 'Author',
  pageCount: 0,
  amazonLink: '',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: new Date().toISOString(),
  shelfIds: [],
  ...overrides,
});

describe('isPhotoId', () => {
  it('returns true for photo- prefixed ids', () => {
    expect(isPhotoId('photo-abc123')).toBe(true);
    expect(isPhotoId('photo-')).toBe(true);
  });

  it('returns false for real ISBNs', () => {
    expect(isPhotoId('9780141036144')).toBe(false);
    expect(isPhotoId('0141036141')).toBe(false);
  });
});

describe('isBookPhotoOnly', () => {
  it('returns true when isPhotoOnly is true', () => {
    expect(isBookPhotoOnly(makeBook({ isPhotoOnly: true, isbn: 'photo-x' }))).toBe(true);
  });

  it('returns true for legacy photo- isbn when isPhotoOnly undefined', () => {
    expect(isBookPhotoOnly(makeBook({ isbn: 'photo-abc' }))).toBe(true);
  });

  it('returns false for real ISBN books', () => {
    expect(isBookPhotoOnly(makeBook())).toBe(false);
  });
});

describe('isbnExistsInLibrary', () => {
  it('detects duplicate by exact ISBN-13', () => {
    const books = [makeBook({ isbn: '9780141036144' })];
    expect(isbnExistsInLibrary('9780141036144', books)).toBe(true);
  });

  it('detects duplicate when ISBN-10 matches stored ISBN-13', () => {
    const books = [makeBook({ isbn: '9780141036144' })];
    expect(isbnExistsInLibrary('0141036141', books)).toBe(true);
  });

  it('detects duplicate when ISBN-13 matches stored ISBN-10', () => {
    const books = [makeBook({ isbn: '0141036141' })];
    expect(isbnExistsInLibrary('9780141036144', books)).toBe(true);
  });

  it('returns false for photo IDs', () => {
    const books = [makeBook()];
    expect(isbnExistsInLibrary('photo-abc', books)).toBe(false);
  });

  it('excludes photo-only books from ISBN check', () => {
    const books = [makeBook({ isbn: 'photo-abc', isPhotoOnly: true })];
    expect(isbnExistsInLibrary('9780141036144', books)).toBe(false);
  });
});
