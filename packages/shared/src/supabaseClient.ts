import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';

export interface SpineSupabaseOptions {
  /** Session storage. Web passes localStorage; iOS passes SecureStore with an AsyncStorage fallback. */
  storage?: SupportedStorage;
  /**
   * Web finishes the OAuth redirect in the page URL. Native exchanges the code
   * explicitly, so it should leave this off.
   */
  detectSessionInUrl?: boolean;
}

/**
 * PKCE Supabase client shared by the PWA and the iOS app.
 * The caller supplies storage and where the session is detected.
 */
export function createSpineSupabaseClient(
  url: string,
  key: string,
  options: SpineSupabaseOptions = {},
): SupabaseClient {
  return createClient(url, key, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: options.detectSessionInUrl ?? true,
      persistSession: true,
      autoRefreshToken: true,
      storage: options.storage,
    },
  });
}
