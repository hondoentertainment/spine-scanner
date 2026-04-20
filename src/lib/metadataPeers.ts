import type { BookEntry, BookMetadata, MetadataSource } from '../types.ts';
import { generateAmazonLink } from '../utils/amazonLink.ts';

const normAuthor = (s: string): string =>
  s.trim().toLowerCase().replace(/\s+/g, ' ');

const normTitle = (s: string | undefined): string =>
  (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** When both APIs returned data, report which fields disagree (for UI + conflict resolution). */
export function getMetadataConflictFlags(book: BookEntry): {
  author: boolean;
  pageCount: boolean;
  title: boolean;
} {
  const g = book.metadataPeers?.google;
  const o = book.metadataPeers?.openLibrary;
  if (!g || !o) return { author: false, pageCount: false, title: false };

  const author = normAuthor(g.author) !== normAuthor(o.author);
  const pageCount =
    g.pageCount > 0 &&
    o.pageCount > 0 &&
    g.pageCount !== o.pageCount;

  const gt = normTitle(g.title);
  const ot = normTitle(o.title);
  const title = gt.length > 0 && ot.length > 0 && gt !== ot;

  return { author, pageCount, title };
}

export function peersFromApiSnapshots(
  google: BookMetadata | null,
  openLibrary: BookMetadata | null,
): BookEntry['metadataPeers'] | undefined {
  const peers: NonNullable<BookEntry['metadataPeers']> = {};
  if (google) {
    peers.google = {
      title: google.title,
      author: google.authors.join(', '),
      pageCount: google.pageCount,
      thumbnail: google.thumbnail ?? '',
    };
  }
  if (openLibrary) {
    peers.openLibrary = {
      title: openLibrary.title,
      author: openLibrary.authors.join(', '),
      pageCount: openLibrary.pageCount,
      thumbnail: openLibrary.thumbnail ?? '',
    };
  }
  return peers.google || peers.openLibrary ? peers : undefined;
}

export function labelForMetadataSource(source: BookEntry['metadataSource'] | undefined): string {
  if (source === 'google_books') return 'Google Books';
  if (source === 'open_library') return 'Open Library';
  if (source === 'manual') return 'Manual';
  return 'Unknown';
}

/**
 * Apply one provider's snapshot as the canonical row and clear peer snapshots
 * (conflict resolved). Clears user-edited flags for overwritten fields.
 */
export function applyMetadataPeerChoice(
  book: BookEntry,
  provider: Extract<MetadataSource, 'google_books' | 'open_library'>,
): Partial<BookEntry> | null {
  const peer = provider === 'google_books'
    ? book.metadataPeers?.google
    : book.metadataPeers?.openLibrary;
  if (!peer) return null;

  const cleared: BookEntry['metadataUserEdited'] = { ...book.metadataUserEdited };
  delete cleared.title;
  delete cleared.author;
  delete cleared.pageCount;
  delete cleared.coverImg;

  const title = (peer.title?.trim() || book.title).trim() || book.title;
  const author = peer.author.trim() || book.author;
  const thumb = peer.thumbnail?.trim() ?? '';

  return {
    title,
    author,
    pageCount: peer.pageCount,
    coverImg: thumb || book.coverImg,
    metadataSource: provider,
    metadataPeers: undefined,
    metadataUserEdited: Object.keys(cleared).length ? cleared : undefined,
    amazonLink: generateAmazonLink(book.isbn),
  };
}
