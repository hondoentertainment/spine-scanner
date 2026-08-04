import { describe, it, expect } from 'vitest';
import { findBooksMissingCovers, extractCoverUpdate } from '../missingCovers';
import { FALLBACK_COVER_DATA_URL } from '../bookPresentation';
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

describe('findBooksMissingCovers', () => {
  it('includes books with an empty cover', () => {
    const books = [makeBook({ id: 'a', coverImg: '' }), makeBook({ id: 'b', coverImg: '   ' })];
    expect(findBooksMissingCovers(books).map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('includes books stuck on the fallback placeholder cover', () => {
    const books = [makeBook({ coverImg: FALLBACK_COVER_DATA_URL })];
    expect(findBooksMissingCovers(books)).toHaveLength(1);
  });

  it('excludes books that already have a real cover', () => {
    const books = [makeBook({ coverImg: 'https://covers.example.com/1.jpg' })];
    expect(findBooksMissingCovers(books)).toHaveLength(0);
  });

  it('excludes photo-only books', () => {
    const books = [
      makeBook({ isbn: 'photo-abc', coverImg: '' }),
      makeBook({ isPhotoOnly: true, coverImg: '' }),
    ];
    expect(findBooksMissingCovers(books)).toHaveLength(0);
  });

  it('excludes books whose cover was user-edited', () => {
    const books = [makeBook({ coverImg: '', userEditedFields: { coverImg: true } })];
    expect(findBooksMissingCovers(books)).toHaveLength(0);
  });

  it('excludes books with a legacy metadataUserEdited cover flag', () => {
    const books = [makeBook({ coverImg: '', metadataUserEdited: { coverImg: true } })];
    expect(findBooksMissingCovers(books)).toHaveLength(0);
  });

  it('still includes books when unrelated fields were user-edited', () => {
    const books = [makeBook({ coverImg: '', userEditedFields: { title: true } })];
    expect(findBooksMissingCovers(books)).toHaveLength(1);
  });
});

describe('extractCoverUpdate', () => {
  it('returns only the cover field from a full refresh result', () => {
    const update = extractCoverUpdate({
      title: 'New Title',
      author: 'New Author',
      coverImg: 'https://covers.example.com/2.jpg',
    });
    expect(update).toEqual({ coverImg: 'https://covers.example.com/2.jpg' });
  });

  it('returns null when the refresh failed', () => {
    expect(extractCoverUpdate(null)).toBeNull();
  });

  it('returns null when the refresh result has no cover', () => {
    expect(extractCoverUpdate({ title: 'New Title' })).toBeNull();
    expect(extractCoverUpdate({ coverImg: '' })).toBeNull();
    expect(extractCoverUpdate({ coverImg: '   ' })).toBeNull();
  });

  it('returns null when the refresh only produced the fallback placeholder', () => {
    expect(extractCoverUpdate({ coverImg: FALLBACK_COVER_DATA_URL })).toBeNull();
  });
});
