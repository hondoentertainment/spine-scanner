import type { BookEntry, BookLookupResult } from '../types.ts';
import { generateAmazonLink } from '../utils/amazonLink.ts';
import { peersFromApiSnapshots } from './metadataPeers.ts';

/**
 * Merge a fresh API lookup into an existing book without overwriting user-edited fields.
 */
export function applyMetadataRefresh(
  book: BookEntry,
  lookup: BookLookupResult | null,
): Partial<BookEntry> {
  if (!lookup) return {};

  const user = book.metadataUserEdited ?? {};
  const peers = peersFromApiSnapshots(lookup.google, lookup.openLibrary);

  const updates: Partial<BookEntry> = {
    metadataSource: lookup.metadataSource,
    ...(peers ? { metadataPeers: peers } : {}),
  };

  if (!user.title) updates.title = lookup.title;
  if (!user.author) updates.author = lookup.authors.join(', ');
  if (!user.pageCount) updates.pageCount = lookup.pageCount;
  if (!user.coverImg) updates.coverImg = lookup.thumbnail;

  updates.amazonLink = generateAmazonLink(book.isbn);

  return updates;
}
