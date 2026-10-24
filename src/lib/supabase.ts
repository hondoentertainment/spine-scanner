import type { SupabaseClient, SupportedStorage } from '@supabase/supabase-js';
import { createSpineSupabaseClient as createSharedSupabaseClient } from '../../packages/shared/src/supabaseClient.ts';
import { e2eHooksEnabled, readE2ESupabaseConfig } from './e2eHooks.ts';
import { noteOAuthCallback } from './googleAuth.ts';

if (typeof window !== 'undefined') {
  noteOAuthCallback(window.location.href);
}

/**
 * PKCE is required so the OAuth `code` survives the round trip back into the
 * app. The verifier lives in localStorage (not sessionStorage) so an installed
 * iOS PWA and the Safari handoff can finish the exchange on the same origin.
 */
export function createSpineSupabaseClient(url: string, key: string): SupabaseClient {
  const storage: SupportedStorage | undefined = typeof window !== 'undefined' ? window.localStorage : undefined;
  return createSharedSupabaseClient(url, key, {
    storage,
    detectSessionInUrl: true,
  });
}

const runtime = readE2ESupabaseConfig(e2eHooksEnabled());
const supabaseUrl = runtime?.url ?? (import.meta.env.VITE_SUPABASE_URL as string | undefined);
const supabaseAnonKey = runtime?.anonKey ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

/**
 * Supabase client — only initialized when env vars are present.
 * The app works fully offline with localStorage when Supabase is not configured.
 */
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createSpineSupabaseClient(supabaseUrl, supabaseAnonKey)
    : null;

/** Returns true when the app has a valid Supabase configuration */
export const isSupabaseConfigured = (): boolean => supabase !== null;
