import { afterEach, describe, expect, it } from 'vitest';
import { readE2EAuthSeed, readE2ESupabaseConfig } from '../e2eHooks';

describe('e2e hooks', () => {
  afterEach(() => {
    delete window.__SPINE_E2E_SUPABASE__;
    delete window.__SPINE_E2E_AUTH__;
  });

  it('ignores window config unless the build flag is on', () => {
    window.__SPINE_E2E_SUPABASE__ = { url: 'https://example.supabase.co', anonKey: 'k' };
    window.__SPINE_E2E_AUTH__ = { email: 'a@example.com', name: 'Ada' };
    expect(readE2ESupabaseConfig(false)).toBeNull();
    expect(readE2EAuthSeed(false)).toBeNull();
  });

  it('reads a test Supabase config and a mocked signed-in reader', () => {
    window.__SPINE_E2E_SUPABASE__ = { url: 'https://example.supabase.co', anonKey: 'k' };
    window.__SPINE_E2E_AUTH__ = { email: 'a@example.com', name: 'Ada', avatarUrl: 'https://example.com/a.png' };
    expect(readE2ESupabaseConfig(true)).toEqual({ url: 'https://example.supabase.co', anonKey: 'k' });
    expect(readE2EAuthSeed(true)?.name).toBe('Ada');
    window.__SPINE_E2E_SUPABASE__ = { url: '', anonKey: '' };
    expect(readE2ESupabaseConfig(true)).toBeNull();
  });
});
