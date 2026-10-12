import { beforeEach, describe, expect, it } from 'vitest';
import type { BookEntry } from '../../types.ts';
import { useBookStore } from '../../store/useBookStore.ts';
import { importShelfBooks, shelfItemsToBooks } from '../reviewImport.ts';
import { scanShelfPhoto } from '../scanShelf.ts';
import type { ShelfMetadataHit, ShelfReviewItem } from '../types.ts';
import { shelfRowImage } from './imageFixture.ts';

const hit = (isbn: string, title: string, author: string): ShelfMetadataHit => ({
  isbn,
  title,
  author,
  pageCount: 320,
  thumbnail: `https://covers.example/${isbn}.jpg`,
  source: 'google_books',
});

const OCR: Record<string, string> = {
  'spine-1-1': 'The Left Hand of Darkness\nUrsula K. Le Guin\n9780441478125',
  'spine-1-2': 'Nineteen Eighty-Four\nGeorge Orwell\n9780141036144',
  'spine-1-3': 'Cataloging in Publication\n9780306406157',
};

async function scanFixture(overrides: Partial<Parameters<typeof scanShelfPhoto>[1]> = {}) {
  return scanShelfPhoto(shelfRowImage(), {
    recognizeText: async (region) => ({ text: OCR[region.id] ?? '', confidence: 90 }),
    decodeBarcode: async () => null,
    lookupByIsbn: async (isbn) => {
      if (isbn === '9780441478125') return hit(isbn, 'The Left Hand of Darkness', 'Ursula K. Le Guin');
      if (isbn === '9780141036144') return hit(isbn, 'Nineteen Eighty-Four', 'George Orwell');
      if (isbn === '9780306406157') return hit(isbn, 'The ISBN Handbook', 'International ISBN Agency');
      return null;
    },
    lookupByQuery: async () => null,
    ...overrides,
  });
}

describe('shelf scan → review → import', () => {
  beforeEach(() => {
    useBookStore.setState({ books: [], shelves: [] });
  });

  it('detects three spines, looks them up, and imports only the accepted edits', async () => {
    const detected = await scanFixture();
    expect(detected.map((item) => item.title)).toEqual([
      'The Left Hand of Darkness',
      'Nineteen Eighty-Four',
      'The ISBN Handbook',
    ]);
    expect(detected.every((item) => item.decision === 'accept')).toBe(true);
    expect(detected[0].metadataSource).toBe('google_books');
    expect(detected[0].coverImg).toContain('9780441478125');

    const reviewed: ShelfReviewItem[] = detected.map((item) => {
      if (item.id === 'spine-1-2') return { ...item, decision: 'reject' };
      if (item.id === 'spine-1-1') return { ...item, title: 'Left Hand of Darkness' };
      return item;
    });

    const { added, skippedDuplicates } = importShelfBooks(
      reviewed,
      [],
      useBookStore.getState().addBook,
      { now: '2026-10-12T00:00:00.000Z', createId: (() => {
        let n = 0;
        return () => `book-${++n}`;
      })() },
    );

    expect(skippedDuplicates).toBe(0);
    expect(added.map((book) => book.title)).toEqual(['Left Hand of Darkness', 'The ISBN Handbook']);
    expect(added.map((book) => book.isbn)).toEqual(['9780441478125', '9780306406157']);
    expect(useBookStore.getState().books.map((book) => book.id).sort()).toEqual(['book-1', 'book-2']);
    expect(useBookStore.getState().books.find((book) => book.isbn === '9780141036144')).toBeUndefined();
  });

  it('keeps the OCR title when metadata lookup fails', async () => {
    const detected = await scanFixture({
      lookupByIsbn: async () => {
        throw new Error('offline');
      },
    });
    expect(detected[0].title).toBe('The Left Hand of Darkness');
    expect(detected[0].author).toBe('Ursula K. Le Guin');
    expect(detected[0].isbn).toBe('9780441478125');
    expect(detected[0].metadataSource).toBe('manual');
  });

  it('skips an ISBN that is already in the library', () => {
    const existing: BookEntry = {
      id: 'already',
      isbn: '9780441478125',
      title: 'The Left Hand of Darkness',
      author: 'Ursula K. Le Guin',
      pageCount: 300,
      amazonLink: '',
      coverImg: '',
      status: 'to-read',
      notes: '',
      dateAdded: '2026-01-01T00:00:00.000Z',
      shelfIds: [],
    };
    const items: ShelfReviewItem[] = [{
      id: 'spine-1-1',
      title: 'The Left Hand of Darkness',
      author: 'Ursula K. Le Guin',
      isbn: '9780441478125',
      pageCount: 300,
      coverImg: '',
      previewUrl: '',
      confidence: 0.9,
      decision: 'accept',
      metadataSource: 'google_books',
      detectionMethod: 'barcode',
      needsReview: false,
      reviewReason: '',
      rawText: '',
    }];
    const { books, skippedDuplicates } = shelfItemsToBooks(items, [existing], {
      now: '2026-10-12T00:00:00.000Z',
      createId: () => 'new-id',
    });
    expect(books).toEqual([]);
    expect(skippedDuplicates).toBe(1);
  });

  it('saves a spine without an ISBN as a photo-only book', () => {
    const items: ShelfReviewItem[] = [{
      id: 'spine-1-1',
      title: 'Handwritten notebook',
      author: 'Ada Lovelace',
      isbn: '',
      pageCount: 0,
      coverImg: '',
      previewUrl: 'data:image/jpeg;base64,crop',
      confidence: 0.7,
      decision: 'accept',
      metadataSource: 'manual',
      detectionMethod: 'ocr',
      needsReview: true,
      reviewReason: 'No ISBN detected.',
      rawText: 'Handwritten notebook',
    }];
    const { books } = shelfItemsToBooks(items, [], {
      now: '2026-10-12T00:00:00.000Z',
      createId: () => 'photo-id',
    });
    expect(books[0]).toMatchObject({
      id: 'photo-id',
      isbn: 'photo-photo-id',
      isPhotoOnly: true,
      title: 'Handwritten notebook',
      coverImg: 'data:image/jpeg;base64,crop',
      needsReview: true,
    });
  });

  it('uses vision text only to fill spines the OCR pass could not read', async () => {
    const detected = await scanFixture({
      recognizeText: async () => ({ text: '', confidence: 0 }),
      lookupByIsbn: async () => null,
      visionBooks: [
        { title: 'The Dispossessed', author: 'Ursula K. Le Guin', isbn: '' },
        { title: 'Dune', author: 'Frank Herbert', isbn: '9780441172719' },
        { title: '', author: '', isbn: '' },
      ],
    });
    expect(detected[0]).toMatchObject({
      title: 'The Dispossessed',
      author: 'Ursula K. Le Guin',
      detectionMethod: 'vision',
    });
    expect(detected[1].title).toBe('Dune');
    expect(detected[1].isbn).toBe('9780441172719');
    expect(detected[2].decision).toBe('reject');
  });

  it('falls back to vision books when the photo has no separable spines', async () => {
    const { solidImage } = await import('./imageFixture.ts');
    const detected = await scanShelfPhoto(solidImage(80, 40, [240, 240, 240]), {
      recognizeText: async () => ({ text: '', confidence: 0 }),
      visionBooks: [{ title: 'Kindred', author: 'Octavia Butler', isbn: '9780807083697' }],
    });
    expect(detected).toHaveLength(1);
    expect(detected[0].title).toBe('Kindred');
    expect(detected[0].detectionMethod).toBe('vision');
    expect(detected[0].needsReview).toBe(true);
  });
});
