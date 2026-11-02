import { completeAuthCallback, friendlyAuthError, parseOAuthCallback } from '@spine/shared';

import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store';

const handledKeys = new Set<string>();

export interface FinishedAuthCallback {
  error: string | null;
  handled: boolean;
}

/**
 * Exchange a magic-link or Google return once.
 * A second delivery of the same code (browser sheet and the callback route)
 * does not call Supabase again.
 */
export async function finishAuthCallback(url: string): Promise<FinishedAuthCallback> {
  if (!url) return { error: null, handled: false };
  const parsed = parseOAuthCallback(url);
  const hasPayload = Boolean(parsed.error || parsed.code || (parsed.accessToken && parsed.refreshToken));
  if (!hasPayload) return { error: null, handled: false };
  if (!supabase) return { error: 'Cloud sign-in is not set up for this install.', handled: true };

  const key = parsed.code || `${parsed.accessToken ?? ''}:${parsed.refreshToken ?? ''}` || parsed.error?.message || url;
  if (handledKeys.has(key)) return { error: null, handled: true };
  handledKeys.add(key);

  try {
    const result = await completeAuthCallback(supabase, url);
    if (result.error) {
      handledKeys.delete(key);
      return { error: result.error, handled: true };
    }
    if (result.session) useAuthStore.getState().setSession(result.session);
    return { error: null, handled: true };
  } catch (err) {
    handledKeys.delete(key);
    return {
      error: friendlyAuthError(err instanceof Error ? err.message : 'Sign-in did not finish. Try again.'),
      handled: true,
    };
  }
}
