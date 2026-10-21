import { describe, expect, it, vi } from 'vitest';

const createClient = vi.hoisted(() => vi.fn(() => ({ auth: {} })));

vi.mock('@supabase/supabase-js', () => ({
  createClient,
}));

import { createSpineSupabaseClient } from '../supabase';

describe('createSpineSupabaseClient', () => {
  it('uses the PKCE flow and localStorage so an installed PWA can finish the redirect', () => {
    createSpineSupabaseClient('https://example.supabase.co', 'anon-key');
    expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'anon-key', {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
        storage: window.localStorage,
      },
    });
  });
});
