/** Shown when Google is opened from an installed app (notably iOS standalone). */
export const INSTALLED_PWA_HINT = 'If Google opens in Safari or Chrome, finish there, then come back to Spine Scanner. Your books stay on this device until you choose to merge.';

/**
 * Where Supabase should send the browser after Google finishes.
 * Trailing slash matches the Site URL / redirect allow-list entries.
 */
export function getOAuthRedirectUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  const url = new URL(base, window.location.origin);
  if (!url.pathname.endsWith('/')) url.pathname = `${url.pathname}/`;
  return url.href;
}

/** Installed PWA (iOS Add to Home Screen sets navigator.standalone). */
export function isInstalledPwa(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  const standalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return true;
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches;
}

export function hasOAuthCode(search: string): boolean {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  return new URLSearchParams(raw).has('code');
}

export function readOAuthReturnError(search: string): { cancelled: boolean; message: string } | null {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const error = params.get('error');
  const description = params.get('error_description');
  if (!error && !description) return null;
  const combined = `${error ?? ''} ${description ?? ''}`;
  const cancelled = /access_denied|cancel/i.test(combined);
  if (cancelled) {
    return {
      cancelled: true,
      message: 'Google sign-in was cancelled. Your library is still on this device.',
    };
  }
  const decoded = description
    ? safeDecode(description)
    : 'Google sign-in did not finish. Try again.';
  return { cancelled: false, message: decoded };
}

export function stripOAuthErrorParams(href: string): string {
  const url = new URL(href, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  url.searchParams.delete('error');
  url.searchParams.delete('error_description');
  url.searchParams.delete('error_code');
  return `${url.pathname}${url.search}${url.hash}` || '/';
}

/** Same-window navigation. Popups drop the PKCE verifier in an installed iOS PWA. */
export function redirectBrowser(url: string): void {
  window.location.assign(url);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}
