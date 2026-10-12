import type { BookEntry } from '../types.ts';
import { isValidIsbn } from '../utils/isbnValidation.ts';
import { generateAmazonLink } from '../utils/amazonLink.ts';
import { canonicalIsbn } from './rank.ts';
import type { BookRecommendation } from './types.ts';

function createId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/** A suggestion becomes a to-read library row. That is the wishlist. */
export function toWishlistBook(recommendation: BookRecommendation, now = new Date()): BookEntry {
  const id = createId();
  const isbn = canonicalIsbn(recommendation.isbn);
  const validIsbn = Boolean(isbn && isValidIsbn(isbn));
  return {
    id,
    isbn: validIsbn ? isbn : `wish-${id}`,
    title: recommendation.title,
    author: recommendation.author,
    pageCount: recommendation.pageCount > 0 ? recommendation.pageCount : 0,
    amazonLink: validIsbn ? generateAmazonLink(isbn) : '',
    coverImg: recommendation.coverImg,
    status: 'to-read',
    notes: recommendation.reason,
    dateAdded: now.toISOString(),
    shelfIds: [],
    ...(recommendation.seriesName ? { seriesName: recommendation.seriesName } : {}),
    metadataSource: recommendation.source === 'llm' ? 'manual' : recommendation.source,
    needsReview: !validIsbn,
    reviewReason: validIsbn ? '' : 'Added from suggestions without an ISBN.',
  };
}
