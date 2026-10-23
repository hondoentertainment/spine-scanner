import { getRouterBasename } from './routerBasename.ts';
import {
  friendlyAuthError,
  GOOGLE_CANCELLED_MESSAGE,
  GOOGLE_PROVIDER_DISABLED_MESSAGE,
  parseOAuthCallback,
  sanitizeReturnPath,
  SPINE_MOBILE_GOOGLE_REDIRECT,
  stripOAuthParams,
  type OAuthCallback,
  type OAuthReturnError,
} from '../../packages/shared/src/authMessages.ts';

export {
  friendlyAuthError,
  parseOAuthCallback,
  sanitizeReturnPath,
  stripOAuthParams,
  SPINE_MOBILE_GOOGLE_REDIRECT,
  GOOGLE_PROVIDER_DISABLED_MESSAGE,
  GOOGLE_CANCELLED_MESSAGE,
};
export type { OAuthCallback, OAuthReturnError };

/** Shown when Google is opened from an installed app (notably iOS standalone). */
export const INSTALLED_PWA_HINT = 'If Google opens in Safari or Chrome, finish there, then come back to Spine Scanner. Your books stay on this device until you choose to merge.';

const RETURN_KEY = 'spine-scanner.auth-return';

let earlySnapshot: OAuthCallback | null = null;
let handledKey: string | null = null;

/**
 * Where Supabase should send the browser after Google, a magic link, or a
 * password reset finishes. The origin is always the page the user is on, so
 * production, Vercel previews, and localhost:5173 each return to themselves.
 * An optional app path (for example `/library`) is appended under the Vite base.
 */
export function getOAuthRedirectUrl(
  returnPath?: string,
  env: { origin?: string; base?: string } = {},
): string {
  const origin = env.origin ?? window.location.origin;
  const base = env.base ?? (import.meta.env.BASE_URL || '/');
  const root = new URL(base, origin);
  if (!root.pathname.endsWith('/')) root.pathname = `${root.pathname}/`;

  const safe = sanitizeReturnPath(returnPath);
  if (!safe) return root.href;

  const route = safe.split(/[?#]/)[0] || '/';
  const relative = route.replace(/^\/+/, '');
  let target: URL;
  try {
    target = new URL(relative, root);
  } catch {
    return root.href;
  }
  if (target.origin !== origin) return root.href;
  const basePrefix = root.pathname.replace(/\/$/, '');
  if (basePrefix && target.pathname !== basePrefix && !target.pathname.startsWith(`${basePrefix}/`)) {
    return root.href;
  }
  return target.href;
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
  return Boolean(parseOAuthCallback(search).code);
}

export function readOAuthReturnError(input: string): OAuthReturnError | null {
  return parseOAuthCallback(input).error;
}

/** @deprecated Use stripOAuthParams. Kept so callers that only strip errors stay correct. */
export function stripOAuthErrorParams(href: string): string {
  return stripOAuthParams(href);
}

/** Same-window navigation. Popups drop the PKCE verifier in an installed iOS PWA. */
export function redirectBrowser(url: string): void {
  window.location.assign(url);
}

/** App path relative to the router basename, without OAuth params. */
export function currentAppPath(): string {
  if (typeof window === 'undefined') return '/';
  const basename = getRouterBasename();
  let path = window.location.pathname;
  if (basename && (path === basename || path.startsWith(`${basename}/`))) {
    path = path.slice(basename.length) || '/';
  }
  if (!path.startsWith('/')) path = `/${path}`;
  return sanitizeReturnPath(stripOAuthParams(`${path}${window.location.search}${window.location.hash}`)) ?? '/';
}

export function rememberAuthReturn(path: string): void {
  const safe = sanitizeReturnPath(path);
  if (!safe) return;
  try {
    sessionStorage.setItem(RETURN_KEY, safe);
  } catch {
    // Private mode can reject sessionStorage. The redirect path still returns them to the route.
  }
}

export function consumeAuthReturn(): string | null {
  try {
    const safe = sanitizeReturnPath(sessionStorage.getItem(RETURN_KEY));
    sessionStorage.removeItem(RETURN_KEY);
    return safe;
  } catch {
    return null;
  }
}

/**
 * Record the callback URL before the Supabase client runs detectSessionInUrl.
 * The client may remove `?code` / `#access_token` before React initializes.
 */
export function noteOAuthCallback(href: string): void {
  const parsed = parseOAuthCallback(href);
  if (parsed.code || parsed.error || parsed.accessToken) earlySnapshot = parsed;
}

export function resetOAuthCallbackState(): void {
  earlySnapshot = null;
  handledKey = null;
}

/** First reader wins, so a second initialize pass does not exchange the code twice. */
export function consumeOAuthCallback(href: string): OAuthCallback | null {
  const live = parseOAuthCallback(href);
  const liveHit = Boolean(live.code || live.error || live.accessToken);
  const chosen = liveHit ? live : earlySnapshot;
  if (!chosen || !(chosen.code || chosen.error || chosen.accessToken)) return null;
  const key = liveHit ? href : 'early-oauth-callback';
  if (handledKey === key) return null;
  handledKey = key;
  earlySnapshot = null;
  return chosen;
}
