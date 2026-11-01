import { describe, expect, it } from 'vitest';
import { createPhotoOnlyBook, PHOTO_ONLY_REVIEW_REASON } from '../../../packages/shared/src/bookState.ts';

describe('createPhotoOnlyBook', () => {
  it('matches the web photo capture when the title is left blank', () => {
    const book = createPhotoOnlyBook({
      id: 'abc',
      title: '   ',
      coverImg: ' data:image/jpeg;base64,abc ',
      dateAdded: '2026-10-01T00:00:00.000Z',
    });
    expect(book).toMatchObject({
      id: 'abc',
      isbn: 'photo-abc',
      isPhotoOnly: true,
      title: 'Unknown Title',
      author: 'Unknown Author',
      pageCount: 0,
      amazonLink: '',
      coverImg: 'data:image/jpeg;base64,abc',
      status: 'to-read',
      notes: '',
      dateAdded: '2026-10-01T00:00:00.000Z',
      shelfIds: [],
      needsReview: true,
      reviewReason: PHOTO_ONLY_REVIEW_REASON,
      metadataSource: 'manual',
    });
  });

  it('keeps an optional title and still marks the book for review', () => {
    const book = createPhotoOnlyBook({ id: 'desk', title: ' Desk copy ' });
    expect(book.title).toBe('Desk copy');
    expect(book.isPhotoOnly).toBe(true);
    expect(book.needsReview).toBe(true);
    expect(book.isbn).toBe('photo-desk');
    expect(book.coverImg).toBe('');
  });
});