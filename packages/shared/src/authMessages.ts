/**
 * Friendly copy and OAuth callback parsing shared by the web app and the iOS app.
 * Provider failures such as "Unsupported provider: provider is not enabled" must
 * stay readable when Google is not turned on in the Supabase dashboard.
 */

const OAUTH_QUERY_KEYS = ['code', 'error', 'error_description', 'error_code', 'state'] as const;

const OAUTH_HASH_KEYS = [
  'access_token',
  'refresh_token',
  'expires_in',
  'expires_at',
  'token_type',
  'provider_token',
  'provider_refresh_token',
  'type',
  'error',
  'error_description',
  'error_code',
  'code',
  'state',
] as const;

/** Exact redirect a development or store build sends to Supabase. */
export const SPINE_MOBILE_GOOGLE_REDIRECT = 'spinescanner://auth/callback';

export const GOOGLE_PROVIDER_DISABLED_MESSAGE =
  "Google sign-in isn't available for this app yet. You can still sign in with email.";

export const GOOGLE_CANCELLED_MESSAGE =
  'Google sign-in was cancelled. Your library is still on this device.';

export interface OAuthReturnError {
  cancelled: boolean;
  message: string;
}

export interface OAuthCallback {
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  error: OAuthReturnError | null;
}

export function friendlyAuthError(message: string): string {
  const decoded = safeDecode(message).trim();
  const lower = decoded.toLowerCase();
  if (!decoded) return 'Sign-in did not finish. Try again.';
  if (/unsupported provider|provider is not enabled/.test(lower)) {
    return GOOGLE_PROVIDER_DISABLED_MESSAGE;
  }
  if (/access_denied|cancell?ed|user denied|popup closed/.test(lower)) {
    return GOOGLE_CANCELLED_MESSAGE;
  }
  if (/invalid login credentials|invalid_credentials/.test(lower)) {
    return "That email and password don't match. Try again, or email yourself a sign-in link.";
  }
  if (/email not confirmed/.test(lower)) {
    return 'Please check your email and confirm your account before signing in.';
  }
  if (/rate limit|too many requests|over_email_send_rate_limit|over_request_rate_limit/.test(lower)) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (/already registered|user already exists|already been registered/.test(lower)) {
    return 'An account with that email already exists. Sign in instead.';
  }
  if (/password should be at least|weak password|password is too short/.test(lower)) {
    return 'Use a password of at least 6 characters.';
  }
  if (/failed to fetch|network request failed|\bnetwork\b|load failed/.test(lower)) {
    return "Can't reach the sign-in service. Check your connection and try again.";
  }
  if (/redirect/.test(lower) && /not allowed|invalid/.test(lower)) {
    return 'This site is not on the sign-in allow list yet. Try the production site or localhost.';
  }
  return decoded;
}

export function parseOAuthCallback(input: string): OAuthCallback {
  const url = toUrl(input);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  const hashIsOAuth = OAUTH_HASH_KEYS.some((key) => hashParams.has(key));
  const searchError = readErrorParams(url.searchParams);
  const hashError = hashIsOAuth ? readErrorParams(hashParams) : null;
  const error = searchError ?? hashError;
  const code = url.searchParams.get('code') || (hashIsOAuth ? hashParams.get('code') : null);
  return {
    code: code || null,
    accessToken: hashIsOAuth ? hashParams.get('access_token') : null,
    refreshToken: hashIsOAuth ? hashParams.get('refresh_token') : null,
    error,
  };
}

/** Removes OAuth query and hash tokens, leaving the app route intact. */
export function stripOAuthParams(href: string): string {
  const url = toUrl(href);
  for (const key of OAUTH_QUERY_KEYS) url.searchParams.delete(key);
  if (url.hash && url.hash.length > 1) {
    const hashParams = new URLSearchParams(url.hash.slice(1));
    const hashIsOAuth = OAUTH_HASH_KEYS.some((key) => hashParams.has(key));
    if (hashIsOAuth) {
      for (const key of OAUTH_HASH_KEYS) hashParams.delete(key);
      const next = hashParams.toString();
      url.hash = next ? `#${next}` : '';
    }
  }
  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ''}${url.hash}` || '/';
}

/** App-relative path only. Rejects other origins and protocol-relative URLs. */
export function sanitizeReturnPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  if (trimmed.includes('\\') || trimmed.includes('://')) return null;
  return trimmed;
}

function readErrorParams(params: URLSearchParams): OAuthReturnError | null {
  const error = params.get('error');
  const description = params.get('error_description');
  if (!error && !description) return null;
  const combined = `${error ?? ''} ${description ?? ''}`;
  const cancelled = !/unsupported provider|provider is not enabled/i.test(combined)
    && /access_denied|cancell?ed|user denied/i.test(combined);
  if (cancelled) return { cancelled: true, message: GOOGLE_CANCELLED_MESSAGE };
  const raw = description || error || '';
  return { cancelled: false, message: friendlyAuthError(raw) };
}

function toUrl(input: string): URL {
  const base = 'http://localhost';
  if (!input) return new URL(base);
  if (input.startsWith('?') || input.startsWith('#')) return new URL(input, `${base}/`);
  if (input.startsWith('/')) return new URL(input, base);
  try {
    return new URL(input);
  } catch {
    return new URL(base);
  }
}

function safeDecode(value: string): string {
  const normalized = value.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
}
