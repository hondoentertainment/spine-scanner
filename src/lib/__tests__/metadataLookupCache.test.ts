import { describe, it, expect, beforeEach } from 'vitest';
import type { MetadataLookupPayload } from '../types.ts';
import {
  clearPersistedLookupCache,
  getPersistedLookup,
  setPersistedLookup,
} from '../metadataLookupCache.ts';

const samplePayload = (): MetadataLookupPayload => ({
  meta: {
    title: 'Sample',
    authors: ['Author'],
    pageCount: 100,
    thumbnail: '',
    isbn: '9780141036144',
    source: 'google_books',
  },
  google: null,
  openLibrary: null,
});

describe('metadataLookupCache', () => {
  beforeEach(() => {
    clearPersistedLookupCache();
  });

  it('stores and retrieves payloads by cache key', () => {
    setPersistedLookup('9780141036144', samplePayload());
    expect(getPersistedLookup('9780141036144')?.meta.title).toBe('Sample');
  });

  it('returns null for missing keys', () => {
    expect(getPersistedLookup('0000000000')).toBeNull();
  });
});
