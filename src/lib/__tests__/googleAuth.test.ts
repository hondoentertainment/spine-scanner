import { describe, expect, it } from 'vitest';
import {
  consumeAuthReturn,
  currentAppPath,
  friendlyAuthError,
  getOAuthRedirectUrl,
  hasOAuthCode,
  isInstalledPwa,
  parseOAuthCallback,
  readOAuthReturnError,
  rememberAuthReturn,
  sanitizeReturnPath,
  stripOAuthErrorParams,
  stripOAuthParams,
  SPINE_MOBILE_GOOGLE_REDIRECT,
} from '../googleAuth';

describe('googleAuth', () => {
  it('builds a trailing-slash redirect on this origin', () => {
    expect(getOAuthRedirectUrl()).toBe(new URL(import.meta.env.BASE_URL || '/', window.location.origin).href);
    expect(getOAuthRedirectUrl()).toContain(window.location.origin);
  });

  it('uses the current origin for production, preview, and localhost', () => {
    expect(getOAuthRedirectUrl('/profile', { origin: 'https://spine-scanner.vercel.app', base: '/' }))
      .toBe('https://spine-scanner.vercel.app/profile');
    expect(getOAuthRedirectUrl('/scan', { origin: 'https://spine-scanner-git-auth-team.vercel.app', base: '/' }))
      .toBe('https://spine-scanner-git-auth-team.vercel.app/scan');
    expect(getOAuthRedirectUrl(undefined, { origin: 'http://localhost:5173', base: '/' }))
      .toBe('http://localhost:5173/');
    expect(getOAuthRedirectUrl('/library', { origin: 'http://localhost:5173', base: '/' }))
      .toBe('http://localhost:5173/library');
    expect(getOAuthRedirectUrl('/profile', { origin: 'https://owner.github.io', base: '/spine-scanner/' }))
      .toBe('https://owner.github.io/spine-scanner/profile');
  });

  it('refuses a redirect off this origin', () => {
    expect(getOAuthRedirectUrl('https://evil.example/phish', { origin: 'http://localhost:5173', base: '/' }))
      .toBe('http://localhost:5173/');
    expect(sanitizeReturnPath('//evil.example')).toBeNull();
    expect(sanitizeReturnPath('/library?status=read#top')).toBe('/library?status=read#top');
  });

  it('detects an OAuth code and a cancellation from the query or the hash', () => {
    expect(hasOAuthCode('?code=abc')).toBe(true);
    expect(hasOAuthCode('')).toBe(false);
    expect(readOAuthReturnError('?error=access_denied&error_description=User+cancelled')).toEqual({
      cancelled: true,
      message: 'Google sign-in was cancelled. Your library is still on this device.',
    });
    expect(readOAuthReturnError('?error=server_error&error_description=boom')?.cancelled).toBe(false);
    expect(readOAuthReturnError('?error_description=boom%20happened')?.message).toBe('boom happened');
    expect(readOAuthReturnError('')).toBeNull();
    expect(readOAuthReturnError('#error=server_error&error_description=Unsupported+provider:+provider+is+not+enabled')).toEqual({
      cancelled: false,
      message: "Google sign-in isn't available for this app yet. You can still sign in with email.",
    });
    expect(parseOAuthCallback('https://spine-scanner.vercel.app/profile?code=abc').code).toBe('abc');
    expect(parseOAuthCallback('https://spine-scanner.vercel.app/#access_token=tok&refresh_token=ref').accessToken).toBe('tok');
  });

  it('strips OAuth errors, the PKCE code, and hash tokens', () => {
    expect(stripOAuthErrorParams('https://spine-scanner.vercel.app/?error=access_denied&error_code=401&kept=1#book')).toBe('/?kept=1#book');
    expect(stripOAuthParams('https://spine-scanner.vercel.app/profile?code=abc&kept=1#access_token=tok&refresh_token=ref&token_type=bearer'))
      .toBe('/profile?kept=1');
    expect(stripOAuthParams('https://spine-scanner.vercel.app/library?status=read#shelf')).toBe('/library?status=read#shelf');
  });

  it('remembers an app path and ignores an off-site return', () => {
    sessionStorage.clear();
    rememberAuthReturn('/library?status=read');
    expect(consumeAuthReturn()).toBe('/library?status=read');
    rememberAuthReturn('https://evil.example');
    expect(consumeAuthReturn()).toBeNull();
    window.history.replaceState({}, '', '/profile?code=1#access_token=tok');
    expect(currentAppPath()).toBe('/profile');
    window.history.replaceState({}, '', '/');
  });

  it('maps a disabled Google provider and keeps the mobile redirect exact', () => {
    expect(friendlyAuthError('Unsupported provider: provider is not enabled'))
      .toMatch(/isn't available/i);
    expect(friendlyAuthError('Invalid login credentials')).toMatch(/don't match/i);
    expect(SPINE_MOBILE_GOOGLE_REDIRECT).toBe('spinescanner://auth/callback');
  });

  it('treats an installed display mode as a PWA', () => {
    const originalMedia = window.matchMedia;
    const originalNav = window.navigator;
    const media = (matches: (query: string) => boolean) => {
      window.matchMedia = ((query: string) => ({
        matches: matches(query),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
        onchange: null,
      })) as unknown as typeof window.matchMedia;
    };
    media((query) => query.includes('standalone'));
    expect(isInstalledPwa()).toBe(true);
    media((query) => query.includes('fullscreen'));
    expect(isInstalledPwa()).toBe(true);
    media(() => false);
    expect(isInstalledPwa()).toBe(false);
    Object.defineProperty(window, 'navigator', { configurable: true, value: { standalone: true } });
    expect(isInstalledPwa()).toBe(true);
    Object.defineProperty(window, 'navigator', { configurable: true, value: originalNav });
    window.matchMedia = originalMedia;
  });
});
