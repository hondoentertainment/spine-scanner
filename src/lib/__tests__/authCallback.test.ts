import { describe, expect, it, vi } from 'vitest';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { completeAuthCallback, resolveAuthCallbackUrl } from '../../../packages/shared/src/authCallback.ts';
import { emailAddressProblem } from '../../../packages/shared/src/authMessages.ts';

const session = { user: { id: 'user-1' } } as Session;

function client(auth: Record<string, unknown>): SupabaseClient {
  return { auth } as unknown as SupabaseClient;
}

describe('emailAddressProblem', () => {
  it('asks for an email and rejects a malformed one', () => {
    expect(emailAddressProblem('  ')).toMatch(/enter your email/i);
    expect(emailAddressProblem('not-an-email')).toMatch(/valid email/i);
    expect(emailAddressProblem(' reader@example.com ')).toBeNull();
  });
});

describe('completeAuthCallback', () => {
  it('exchanges a PKCE code from the app callback', async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ data: { session }, error: null });
    const result = await completeAuthCallback(
      client({ exchangeCodeForSession, setSession: vi.fn() }),
      'spinescanner://auth/callback?code=abc',
    );
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(result).toEqual({ session, error: null, handled: true });
  });

  it('restores a hash session', async () => {
    const setSession = vi.fn().mockResolvedValue({ data: { session }, error: null });
    const result = await completeAuthCallback(
      client({ exchangeCodeForSession: vi.fn(), setSession }),
      'spinescanner://auth/callback#access_token=tok&refresh_token=ref&token_type=bearer',
    );
    expect(setSession).toHaveBeenCalledWith({ access_token: 'tok', refresh_token: 'ref' });
    expect(result.session).toBe(session);
    expect(result.error).toBeNull();
  });

  it('returns a friendly error for a provider failure or a failed exchange', async () => {
    const denied = await completeAuthCallback(
      client({ exchangeCodeForSession: vi.fn(), setSession: vi.fn() }),
      'spinescanner://auth/callback?error=access_denied&error_description=User+cancelled',
    );
    expect(denied.handled).toBe(true);
    expect(denied.session).toBeNull();
    expect(denied.error).toMatch(/cancelled/i);

    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      data: { session: null },
      error: { message: 'over_request_rate_limit' },
    });
    const limited = await completeAuthCallback(
      client({ exchangeCodeForSession, setSession: vi.fn() }),
      'spinescanner://auth/callback?code=abc',
    );
    expect(limited.error).toMatch(/too many attempts/i);

    const setSession = vi.fn().mockResolvedValue({
      data: { session: null },
      error: { message: 'Network request failed' },
    });
    const offline = await completeAuthCallback(
      client({ exchangeCodeForSession: vi.fn(), setSession }),
      'spinescanner://auth/callback#access_token=tok&refresh_token=ref',
    );
    expect(offline.error).toMatch(/connection/i);
  });

  it('ignores a callback URL with no auth payload', async () => {
    const exchangeCodeForSession = vi.fn();
    const result = await completeAuthCallback(
      client({ exchangeCodeForSession, setSession: vi.fn() }),
      'spinescanner://auth/callback',
    );
    expect(result).toEqual({ session: null, error: null, handled: false });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });
});

describe('resolveAuthCallbackUrl', () => {
  it('prefers a linking URL that already has the code or hash session', () => {
    expect(resolveAuthCallbackUrl('spinescanner://auth/callback?code=abc', { code: 'other' }))
      .toBe('spinescanner://auth/callback?code=abc');
    expect(resolveAuthCallbackUrl('spinescanner://auth/callback#access_token=tok&refresh_token=ref'))
      .toBe('spinescanner://auth/callback#access_token=tok&refresh_token=ref');
  });

  it('rebuilds the callback from route params when the linking URL has no payload', () => {
    expect(resolveAuthCallbackUrl('spinescanner://auth/callback', {
      code: 'abc',
      error: null,
    })).toBe('spinescanner://auth/callback?code=abc');
    expect(resolveAuthCallbackUrl(null, {
      accessToken: 'tok',
      refreshToken: 'ref',
    })).toBe('spinescanner://auth/callback#access_token=tok&refresh_token=ref');
    expect(resolveAuthCallbackUrl(null, {
      error: 'server_error',
      errorDescription: 'boom happened',
    })).toBe('spinescanner://auth/callback?error=server_error&error_description=boom+happened');
  });

  it('returns the plain URL when there is nothing to exchange', () => {
    expect(resolveAuthCallbackUrl('spinescanner://library')).toBe('spinescanner://library');
    expect(resolveAuthCallbackUrl(null)).toBeNull();
  });
});
