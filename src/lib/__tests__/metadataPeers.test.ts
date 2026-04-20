import { describe, it, expect } from 'vitest';
import { getMetadataConflictFlags, peersFromApiSnapshots } from '../metadataPeers.ts';
import type { BookEntry, BookMetadata } from '../../types.ts';

describe('peersFromApiSnapshots', () => {
  it('returns undefined when both providers are null', () => {
    expect(peersFromApiSnapshots(null, null)).toBeUndefined();
  });

  it('maps both providers when present', () => {
    const g: BookMetadata = {
      title: 'T',
      authors: ['A', 'B'],
      pageCount: 100,
      thumbnail: '',
      isbn: '9780000000000',
    };
    const o: BookMetadata = {
      title: 'T',
      authors: ['C'],
      pageCount: 120,
      thumbnail: '',
      isbn: '9780000000000',
    };
    const peers = peersFromApiSnapshots(g, o);
    expect(peers?.google?.author).toBe('A, B');
    expect(peers?.google?.pageCount).toBe(100);
    expect(peers?.openLibrary?.author).toBe('C');
    expect(peers?.openLibrary?.pageCount).toBe(120);
  });
});

describe('getMetadataConflictFlags', () => {
  it('returns false when only one peer exists', () => {
    const book: BookEntry = {
      id: '1',
      isbn: '9780000000000',
      title: 'x',
      author: 'y',
      pageCount: 1,
      amazonLink: '',
      coverImg: '',
      status: 'to-read',
      notes: '',
      dateAdded: new Date().toISOString(),
      shelfIds: [],
      metadataPeers: { google: { author: 'A', pageCount: 10 } },
    };
    expect(getMetadataConflictFlags(book)).toEqual({ author: false, pageCount: false, title: false });
  });

  it('detects author disagreement', () => {
    const book: BookEntry = {
      id: '1',
      isbn: '9780000000000',
      title: 'x',
      author: 'y',
      pageCount: 1,
      amazonLink: '',
      coverImg: '',
      status: 'to-read',
      notes: '',
      dateAdded: new Date().toISOString(),
      shelfIds: [],
      metadataPeers: {
        google: { author: 'Jane Doe', pageCount: 200 },
        openLibrary: { author: 'J. Doe', pageCount: 200 },
      },
    };
    expect(getMetadataConflictFlags(book).author).toBe(true);
    expect(getMetadataConflictFlags(book).pageCount).toBe(false);
  });

  it('detects page count disagreement when both non-zero', () => {
    const book: BookEntry = {
      id: '1',
      isbn: '9780000000000',
      title: 'x',
      author: 'y',
      pageCount: 1,
      amazonLink: '',
      coverImg: '',
      status: 'to-read',
      notes: '',
      dateAdded: new Date().toISOString(),
      shelfIds: [],
      metadataPeers: {
        google: { author: 'Same Author', pageCount: 188 },
        openLibrary: { author: 'Same Author', pageCount: 182 },
      },
    };
    expect(getMetadataConflictFlags(book).author).toBe(false);
    expect(getMetadataConflictFlags(book).pageCount).toBe(true);
  });

  it('ignores page mismatch when one side is zero', () => {
    const book: BookEntry = {
      id: '1',
      isbn: '9780000000000',
      title: 'x',
      author: 'y',
      pageCount: 1,
      amazonLink: '',
      coverImg: '',
      status: 'to-read',
      notes: '',
      dateAdded: new Date().toISOString(),
      shelfIds: [],
      metadataPeers: {
        google: { author: 'A', pageCount: 0 },
        openLibrary: { author: 'A', pageCount: 200 },
      },
    };
    expect(getMetadataConflictFlags(book).pageCount).toBe(false);
  });
});
