import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store';

WebBrowser.maybeCompleteAuthSession();

/** Supabase redirect for Google. Expo Go uses an exp:// URL; a dev or store build uses spinescanner://. */
export function googleRedirectUri(): string {
  return makeRedirectUri({
    scheme: 'spinescanner',
    path: 'auth/callback',
  });
}

export async function signInWithGoogle(): Promise<string | null> {
  if (!supabase) return 'Cloud sign-in is not set up for this install.';
  const redirectTo = googleRedirectUri();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) return error.message;
  if (!data.url) return 'Google did not return a sign-in link. Try again.';

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return null;

  const parsed = new URL(result.url);
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const oauthError = parsed.searchParams.get('error_description') || hash.get('error_description');
  if (oauthError) return oauthError;
  const code = parsed.searchParams.get('code') || hash.get('code');
  if (!code) return 'Google did not return a sign-in code.';

  const exchanged = await supabase.auth.exchangeCodeForSession(code);
  if (exchanged.error) return exchanged.error.message;
  useAuthStore.getState().setSession(exchanged.data.session);
  return null;
}
