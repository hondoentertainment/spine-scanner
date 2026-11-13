import type { PublicPage } from '../components/PublicInfoPage.tsx';
import { readClientAppMeta } from '../lib/appRelease.ts';
import { APP_TITLE } from '../lib/productionMetadata.ts';

export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined;
export const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '');
export const { release: APP_RELEASE, environment: APP_ENV } = readClientAppMeta();

export const PUBLIC_PAGE_META: Record<PublicPage, { title: string; description: string; label: string }> = {
  about: {
    title: 'About SpineScanner',
    description: 'Learn what SpineScanner is for, who it serves, and why it is designed around fast capture and user-owned library data.',
    label: 'About',
  },
  privacy: {
    title: 'Privacy Policy | SpineScanner',
    description: 'Understand how SpineScanner handles local storage, optional cloud sync, camera access, third-party ISBN lookups, and operator-configured monitoring.',
    label: 'Privacy',
  },
  terms: {
    title: 'Terms of Use | SpineScanner',
    description: 'Read the terms for using SpineScanner, including responsible use, third-party metadata, service availability, and backup expectations.',
    label: 'Terms',
  },
  support: {
    title: 'Support | SpineScanner',
    description: 'Get help with scanning, syncing, exports, and recovery workflows for SpineScanner.',
    label: 'Support',
  },
};

export function getPublicPageFromHash(hash: string): PublicPage | null {
  if (hash === 'about' || hash === 'privacy' || hash === 'terms' || hash === 'support') {
    return hash;
  }

  return null;
}

export function getPublicPageFromPath(pathname: string): PublicPage | null {
  const parts = pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  if (last === 'about' || last === 'privacy' || last === 'terms' || last === 'support') {
    return last;
  }
  return null;
}

/**
 * Legacy hash URLs (#about, #book-…) become real paths. Returns null when the
 * hash is empty or not one of those old links.
 */
export function legacyHashToPath(hash: string): string | null {
  if (!hash) return null;

  const fromHashPublic = getPublicPageFromHash(hash);
  if (fromHashPublic) return `/${fromHashPublic}`;

  const match = hash.match(/^book-(.+)$/);
  if (match) {
    const isbn = decodeURIComponent(match[1]);
    if (isbn) return `/library?isbn=${encodeURIComponent(isbn)}`;
  }

  return null;
}

/** One line under the logo — changes with route so each area feels distinct. */
const ROUTE_BRANDING_SUBTITLE: Record<string, string> = {
  '/home': 'Your reading feed, library snapshot, and quick paths to scan.',
  '/scan': 'Scan a barcode or type an ISBN.',
  '/library': 'Browse, search, and organize your saved books.',
  '/recommendations': 'Books you don\'t own yet, based on the ones already on your shelves.',
  '/data': 'Import, export, and back up your library.',
  '/profile': 'Account, cloud sync, import/export, and app preferences.',
};

export function getBrandingSubtitle(pathname: string, publicPage: PublicPage | null): string {
  if (publicPage) {
    return `${PUBLIC_PAGE_META[publicPage].label} · ${APP_TITLE}`;
  }
  return ROUTE_BRANDING_SUBTITLE[pathname] ?? ROUTE_BRANDING_SUBTITLE['/scan'];
}

export function getDocumentTitle(pathname: string, publicPage: PublicPage | null): string {
  if (publicPage) return PUBLIC_PAGE_META[publicPage].title;
  const inner: Record<string, string> = {
    '/home': `Home · ${APP_TITLE}`,
    '/scan': APP_TITLE,
    '/library': `Library · ${APP_TITLE}`,
    '/recommendations': `Suggestions · ${APP_TITLE}`,
    '/data': `Data · ${APP_TITLE}`,
    '/profile': `Profile · ${APP_TITLE}`,
  };
  return inner[pathname] ?? APP_TITLE;
}

export type MainPath = '/home' | '/scan' | '/library' | '/data' | '/profile';
export type AppView = 'home' | 'scan' | 'library' | 'profile';
