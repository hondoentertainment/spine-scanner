import { describe, expect, it } from 'vitest';
import {
  getOAuthRedirectUrl,
  hasOAuthCode,
  isInstalledPwa,
  readOAuthReturnError,
  stripOAuthErrorParams,
} from '../googleAuth';

describe('googleAuth', () => {
  it('builds a trailing-slash redirect on this origin', () => {
    expect(getOAuthRedirectUrl()).toBe(new URL(import.meta.env.BASE_URL || '/', window.location.origin).href);
  });

  it('detects an OAuth code and a cancellation', () => {
    expect(hasOAuthCode('?code=abc')).toBe(true);
    expect(hasOAuthCode('')).toBe(false);
    expect(readOAuthReturnError('?error=access_denied&error_description=User+cancelled')).toEqual({
      cancelled: true,
      message: 'Google sign-in was cancelled. Your library is still on this device.',
    });
    expect(readOAuthReturnError('?error=server_error&error_description=boom')?.cancelled).toBe(false);
    expect(readOAuthReturnError('?error_description=boom%20happened')?.message).toBe('boom happened');
    expect(readOAuthReturnError('')).toBeNull();
  });

  it('strips only the OAuth error params', () => {
    expect(stripOAuthErrorParams('https://spine-scanner.vercel.app/?error=access_denied&error_code=401&kept=1#book')).toBe('/?kept=1#book');
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
