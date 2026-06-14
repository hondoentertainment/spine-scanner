import type { BookEntry, BookLookupResult, BookMetadata } from '../types.ts';
import { generateAmazonLink } from '../utils/amazonLink.ts';
import { getUserEditedFields } from './userEditedFields.ts';
import { toMetadataPeerSnapshot } from './metadataPeers.ts';

export function applyMetadataRefresh(
  book: BookEntry,
  lookup: BookLookupResult,
): Partial<BookEntry> {
  const edited = getUserEditedFields(book);
  const updates: Partial<BookEntry> = {
    metadataSource: lookup.metadataSource,
    metadataPeers: {
      ...(lookup.google ? { google: toMetadataPeerSnapshot(lookup.google) } : {}),
      ...(lookup.openLibrary ? { openLibrary: toMetadataPeerSnapshot(lookup.openLibrary) } : {}),
    },
  };

  if (!edited.title) updates.title = lookup.title;
  if (!edited.author) updates.author = lookup.authors.join(', ');
  if (!edited.pageCount) updates.pageCount = lookup.pageCount;
  if (!edited.coverImg && lookup.thumbnail.trim()) {
    updates.coverImg = lookup.thumbnail;
  }

  if (!book.amazonLink || updates.coverImg) {
    updates.amazonLink = generateAmazonLink(book.isbn);
  }

  return updates;
}

export function peerSnapshotFromMetadata(meta: BookMetadata) {
  return toMetadataPeerSnapshot(meta);
}
