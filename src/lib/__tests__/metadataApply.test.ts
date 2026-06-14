import { describe, it, expect } from 'vitest';
import { buildMetadataRefreshUpdates, recoverCoverFromBook } from '../metadataApply.ts';
import type { BookEntry } from '../../types.ts';

const baseBook = (): BookEntry => ({
  id: 'b1',
  isbn: '9780141036144',
  title: 'Old',
  author: 'Old Author',
  pageCount: 10,
  amazonLink: '',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: new Date().toISOString(),
  shelfIds: [],
});

describe('buildMetadataRefreshUpdates', () => {
  it('stores metadata peers when both providers return data', () => {
    const { updates } = buildMetadataRefreshUpdates(
      baseBook(),
      {
        title: 'New',
        authors: ['A'],
        pageCount: 200,
        thumbnail: '',
        isbn: '9780141036144',
        source: 'google_books',
        conflicts: [{ source: 'open_library', title: 'Alt', authors: ['B'], pageCount: 210, thumbnail: '', isbn: '9780141036144', reasons: ['author'] }],
      },
      {
        title: 'New',
        authors: ['A'],
        pageCount: 200,
        thumbnail: '',
        isbn: '9780141036144',
        source: 'google_books',
      },
      {
        title: 'Alt',
        authors: ['B'],
        pageCount: 210,
        thumbnail: 'https://covers.example/ol.jpg',
        isbn: '9780141036144',
        source: 'open_library',
      },
    );
    expect(updates.metadataPeers?.google?.author).toBe('A');
    expect(updates.metadataPeers?.openLibrary?.author).toBe('B');
    expect(updates.needsReview).toBe(true);
  });

  it('does not overwrite user-edited fields', () => {
    const book: BookEntry = {
      ...baseBook(),
      userEditedFields: { title: true, author: true },
    };
    const { updates } = buildMetadataRefreshUpdates(
      book,
      {
        title: 'New',
        authors: ['New Author'],
        pageCount: 500,
        thumbnail: 'https://covers.example/new.jpg',
        isbn: '9780141036144',
        source: 'google_books',
      },
      {
        title: 'New',
        authors: ['New Author'],
        pageCount: 500,
        thumbnail: 'https://covers.example/new.jpg',
        isbn: '9780141036144',
        source: 'google_books',
      },
      null,
    );
    expect(updates.title).toBeUndefined();
    expect(updates.author).toBeUndefined();
    expect(updates.pageCount).toBe(500);
    expect(updates.coverImg).toBe('https://covers.example/new.jpg');
  });

  it('marks edition fallback for review', () => {
    const { updates, reviewReasons } = buildMetadataRefreshUpdates(
      baseBook(),
      {
        title: 'New',
        authors: ['A'],
        pageCount: 200,
        thumbnail: '',
        isbn: '9780141036144',
        source: 'google_books',
        editionFallback: true,
        matchedIsbn: '0141036141',
      },
      null,
      null,
    );
    expect(reviewReasons.some((reason) => reason.includes('alternate ISBN'))).toBe(true);
    expect(updates.needsReview).toBe(true);
  });
});

describe('recoverCoverFromBook', () => {
  it('uses open library peer thumbnail when cover is empty', () => {
    const book: BookEntry = {
      ...baseBook(),
      metadataPeers: {
        openLibrary: { author: 'A', pageCount: 1, thumbnail: 'https://covers.example/ol.jpg' },
      },
    };
    const patch = recoverCoverFromBook(book);
    expect(patch?.coverImg).toBe('https://covers.example/ol.jpg');
  });

  it('returns null when cover was user-edited', () => {
    const book: BookEntry = {
      ...baseBook(),
      userEditedFields: { coverImg: true },
      metadataPeers: {
        openLibrary: { author: 'A', pageCount: 1, thumbnail: 'https://covers.example/ol.jpg' },
      },
    };
    expect(recoverCoverFromBook(book)).toBeNull();
  });
});
