import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { friendlyAuthError, parseOAuthCallback } from './authMessages';

export interface AuthCallbackResult {
  session: Session | null;
  /** Friendly message when the return carried an error or the exchange failed. */
  error: string | null;
  /** True when the URL carried a code, hash tokens, or an auth error. */
  handled: boolean;
}

/**
 * Finish a Supabase redirect. PKCE returns `?code=`. The implicit flow returns
 * `#access_token` and `#refresh_token`. A URL with neither is left alone.
 */
export async function completeAuthCallback(
  client: SupabaseClient,
  callbackUrl: string,
): Promise<AuthCallbackResult> {
  const parsed = parseOAuthCallback(callbackUrl);
  if (parsed.error) {
    return { session: null, error: parsed.error.message, handled: true };
  }
  if (parsed.code) {
    const exchanged = await client.auth.exchangeCodeForSession(parsed.code);
    if (exchanged.error) {
      return { session: null, error: friendlyAuthError(exchanged.error.message), handled: true };
    }
    return { session: exchanged.data.session, error: null, handled: true };
  }
  if (parsed.accessToken && parsed.refreshToken) {
    const restored = await client.auth.setSession({
      access_token: parsed.accessToken,
      refresh_token: parsed.refreshToken,
    });
    if (restored.error) {
      return { session: null, error: friendlyAuthError(restored.error.message), handled: true };
    }
    return { session: restored.data.session, error: null, handled: true };
  }
  return { session: null, error: null, handled: false };
}

export interface AuthCallbackParts {
  code?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  error?: string | null;
  errorDescription?: string | null;
}

/**
 * Prefer the full linking URL when it already contains the auth payload.
 * Otherwise rebuild `spinescanner://auth/callback` from route params, which
 * is where a code arrives if the hash was split off the route.
 */
export function resolveAuthCallbackUrl(
  linkingUrl: string | null | undefined,
  params: AuthCallbackParts = {},
): string | null {
  if (linkingUrl) {
    const parsed = parseOAuthCallback(linkingUrl);
    if (parsed.code || parsed.error || parsed.accessToken) return linkingUrl;
  }
  const code = params.code || null;
  const error = params.error || null;
  const errorDescription = params.errorDescription || null;
  const accessToken = params.accessToken || null;
  const refreshToken = params.refreshToken || null;
  if (!code && !error && !errorDescription && !accessToken && !refreshToken) {
    return linkingUrl ?? null;
  }
  const query = new URLSearchParams();
  if (code) query.set('code', code);
  if (error) query.set('error', error);
  if (errorDescription) query.set('error_description', errorDescription);
  const hash = new URLSearchParams();
  if (accessToken) hash.set('access_token', accessToken);
  if (refreshToken) hash.set('refresh_token', refreshToken);
  const queryText = query.toString();
  const hashText = hash.toString();
  return `spinescanner://auth/callback${queryText ? `?${queryText}` : ''}${hashText ? `#${hashText}` : ''}`;
}
