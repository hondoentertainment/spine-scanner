import type { BookEntry, BookMetadata, MetadataPeerSnapshot, MetadataSource } from '../types.ts';
import { generateAmazonLink } from '../utils/amazonLink.ts';
import { normalizeComparableText, pageCountsConflict } from './metadataCompare.ts';

export function toMetadataPeerSnapshot(meta: BookMetadata): MetadataPeerSnapshot {
  return {
    title: meta.title,
    author: meta.authors.join(', '),
    pageCount: meta.pageCount,
    thumbnail: meta.thumbnail,
  };
}

export function getMetadataConflictFlags(book: BookEntry): {
  author: boolean;
  pageCount: boolean;
  title: boolean;
} {
  const google = book.metadataPeers?.google;
  const openLibrary = book.metadataPeers?.openLibrary;
  if (!google || !openLibrary) {
    return { author: false, pageCount: false, title: false };
  }

  return {
    title:
      normalizeComparableText(google.title ?? book.title)
      !== normalizeComparableText(openLibrary.title ?? book.title),
    author: normalizeComparableText(google.author) !== normalizeComparableText(openLibrary.author),
    pageCount: pageCountsConflict(google.pageCount, openLibrary.pageCount),
  };
}

export function applyMetadataPeerChoice(
  book: BookEntry,
  provider: Extract<MetadataSource, 'google_books' | 'open_library'>,
): Partial<BookEntry> | null {
  const peer = provider === 'google_books'
    ? book.metadataPeers?.google
    : book.metadataPeers?.openLibrary;
  if (!peer) return null;

  const updates: Partial<BookEntry> = {
    title: peer.title?.trim() || book.title,
    author: peer.author,
    pageCount: peer.pageCount > 0 ? peer.pageCount : book.pageCount,
    metadataSource: provider,
    needsReview: false,
    reviewReason: '',
    amazonLink: generateAmazonLink(book.isbn),
  };

  if (peer.thumbnail?.trim()) {
    updates.coverImg = peer.thumbnail.trim();
  }

  return updates;
}
