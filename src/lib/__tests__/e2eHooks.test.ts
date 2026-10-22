import { afterEach, describe, expect, it } from 'vitest';
import { readE2EAuthSeed, readE2EShelfReview, readE2ESupabaseConfig } from '../e2eHooks';

describe('e2e hooks', () => {
  afterEach(() => {
    delete window.__SPINE_E2E_SUPABASE__;
    delete window.__SPINE_E2E_AUTH__;
    delete window.__SPINE_E2E_SHELF_REVIEW__;
  });

  it('ignores window config unless the build flag is on', () => {
    window.__SPINE_E2E_SUPABASE__ = { url: 'https://example.supabase.co', anonKey: 'k' };
    window.__SPINE_E2E_AUTH__ = { email: 'a@example.com', name: 'Ada' };
    expect(readE2ESupabaseConfig(false)).toBeNull();
    expect(readE2EAuthSeed(false)).toBeNull();
    window.__SPINE_E2E_SHELF_REVIEW__ = [{
      id: 'spine-1',
      title: 'Kindred',
      author: 'Octavia Butler',
      isbn: '',
      pageCount: 0,
      coverImg: '',
      previewUrl: '',
      confidence: 0.9,
      decision: 'accept',
      metadataSource: 'manual',
      detectionMethod: 'ocr',
      needsReview: false,
      reviewReason: '',
      rawText: '',
    }];
    expect(readE2EShelfReview(false)).toBeNull();
  });

  it('reads a test Supabase config and a mocked signed-in reader', () => {
    window.__SPINE_E2E_SUPABASE__ = { url: 'https://example.supabase.co', anonKey: 'k' };
    window.__SPINE_E2E_AUTH__ = { email: 'a@example.com', name: 'Ada', avatarUrl: 'https://example.com/a.png' };
    expect(readE2ESupabaseConfig(true)).toEqual({ url: 'https://example.supabase.co', anonKey: 'k' });
    expect(readE2EAuthSeed(true)?.name).toBe('Ada');
    window.__SPINE_E2E_SUPABASE__ = { url: '', anonKey: '' };
    expect(readE2ESupabaseConfig(true)).toBeNull();
    window.__SPINE_E2E_SHELF_REVIEW__ = [{
      id: 'spine-1',
      title: 'Kindred',
      author: 'Octavia Butler',
      isbn: '9780807083697',
      pageCount: 264,
      coverImg: '',
      previewUrl: '',
      confidence: 0.91,
      decision: 'accept',
      metadataSource: 'open_library',
      detectionMethod: 'ocr',
      needsReview: false,
      reviewReason: '',
      rawText: 'Kindred',
    }];
    expect(readE2EShelfReview(true)?.[0].title).toBe('Kindred');
    window.__SPINE_E2E_SHELF_REVIEW__ = [];
    expect(readE2EShelfReview(true)).toBeNull();
  });
});
