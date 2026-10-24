import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { friendlyAuthError, parseOAuthCallback, SPINE_MOBILE_GOOGLE_REDIRECT } from '@spine/shared';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store';

WebBrowser.maybeCompleteAuthSession();

/**
 * Supabase redirect for Google.
 * A development or store build must use exactly `spinescanner://auth/callback`.
 * `makeRedirectUri({ path: 'auth/callback' })` alone builds `spinescanner:///auth/callback`
 * (an empty host), which does not match that allow-list entry.
 * Expo Go cannot claim the custom scheme, so `native` is ignored there and the
 * exp:// URL from Linking is used instead.
 */
export function googleRedirectUri(): string {
  return makeRedirectUri({
    native: SPINE_MOBILE_GOOGLE_REDIRECT,
    scheme: 'spinescanner',
    path: 'auth/callback',
  });
}

let googleInFlight = false;

export async function signInWithGoogle(): Promise<string | null> {
  if (googleInFlight) return null;
  if (!supabase) return 'Cloud sign-in is not set up for this install.';
  googleInFlight = true;
  const redirectTo = googleRedirectUri();
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) return friendlyAuthError(error.message);
    if (!data.url) return 'Google did not return a sign-in link. Try again.';

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return null;

    const parsed = parseOAuthCallback(result.url);
    if (parsed.error) return parsed.error.message;

    if (parsed.code) {
      const exchanged = await supabase.auth.exchangeCodeForSession(parsed.code);
      if (exchanged.error) return friendlyAuthError(exchanged.error.message);
      useAuthStore.getState().setSession(exchanged.data.session);
      return null;
    }

    if (parsed.accessToken && parsed.refreshToken) {
      const restored = await supabase.auth.setSession({
        access_token: parsed.accessToken,
        refresh_token: parsed.refreshToken,
      });
      if (restored.error) return friendlyAuthError(restored.error.message);
      useAuthStore.getState().setSession(restored.data.session);
      return null;
    }

    return 'Google did not return a sign-in code.';
  } catch (err) {
    return friendlyAuthError(err instanceof Error ? err.message : 'Google sign-in did not finish. Try again.');
  } finally {
    googleInFlight = false;
  }
}
