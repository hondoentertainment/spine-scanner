import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { friendlyAuthError, SPINE_MOBILE_GOOGLE_REDIRECT } from '@spine/shared';
import { supabase } from '../lib/supabase';
import { finishAuthCallback } from './session';

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

    const finished = await finishAuthCallback(result.url);
    if (!finished.handled) return 'Google did not return a sign-in code.';
    return finished.error;
  } catch (err) {
    return friendlyAuthError(err instanceof Error ? err.message : 'Google sign-in did not finish. Try again.');
  } finally {
    googleInFlight = false;
  }
}
