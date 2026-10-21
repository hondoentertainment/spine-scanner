import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { e2eHooksEnabled, readE2ESupabaseConfig } from './e2eHooks.ts';

/**
 * PKCE is required so the OAuth `code` survives the round trip back into the
 * app. The verifier lives in localStorage (not sessionStorage) so an installed
 * iOS PWA and the Safari handoff can finish the exchange on the same origin.
 */
export function createSpineSupabaseClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
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
