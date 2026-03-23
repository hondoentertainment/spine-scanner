import { useState, useEffect, useCallback } from 'react';
import type { PublicPage } from '../components/PublicInfoPage.tsx';
import { addBreadcrumb } from '../lib/errorMonitoring.ts';

export type AppView = 'scan' | 'library' | 'data' | 'profile';

const PUBLIC_PAGE_META: Record<PublicPage, { title: string; description: string; label: string }> = {
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

export { PUBLIC_PAGE_META };

const APP_TITLE = 'SpineScanner';
const APP_DESCRIPTION = 'Digitize and manage your personal book library with barcode scanning, OCR fallback, optional cloud sync, and export-friendly ownership.';
const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '');

function getPublicPageFromHash(hash: string): PublicPage | null {
  if (hash === 'about' || hash === 'privacy' || hash === 'terms' || hash === 'support') {
    return hash;
  }
  return null;
}

function upsertMetaTag(attribute: 'name' | 'property', key: string, value: string) {
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement('meta');
    document.head.appendChild(element);
  }
  element.setAttribute(attribute, key);
  element.content = value;
}

function upsertStructuredData(id: string, payload: Record<string, unknown>) {
  let element = document.head.querySelector(`#${id}`) as HTMLScriptElement | null;
  if (!element) {
    element = document.createElement('script');
    element.type = 'application/ld+json';
    element.id = id;
    document.head.appendChild(element);
  }
  element.textContent = JSON.stringify(payload);
}

// Lazy component preloaders
const preloadScanner = () => import('../components/Scanner.tsx');
const preloadLibrary = () => import('../components/LibraryList.tsx');
const preloadData = () => import('../components/DataManagement.tsx');
const preloadProfile = () => import('../components/ProfileSettings.tsx');

export { preloadScanner, preloadLibrary, preloadData, preloadProfile };

export function useAppNavigation() {
  const [view, setView] = useState<AppView>('scan');
  const [publicPage, setPublicPage] = useState<PublicPage | null>(null);
  const [openBookIsbn, setOpenBookIsbn] = useState<string | null>(null);
  const [srAnnouncement, setSrAnnouncement] = useState('');

  // Hash-based routing
  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash.slice(1);
      const matchedPublicPage = getPublicPageFromHash(hash);

      if (matchedPublicPage) {
        setPublicPage(matchedPublicPage);
        return;
      }

      setPublicPage(null);
      const m = hash.match(/^book-(.+)$/);
      if (m) {
        const isbn = decodeURIComponent(m[1]);
        if (isbn) {
          setView('library');
          setOpenBookIsbn(isbn);
        }
      }
    };

    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  // Preload all lazy components
  useEffect(() => {
    const preloadAll = () => {
      void preloadScanner();
      void preloadLibrary();
      void preloadData();
      void preloadProfile();
    };
    const idleId = typeof requestIdleCallback !== 'undefined'
      ? requestIdleCallback(preloadAll, { timeout: 150 })
      : 0;
    const timeoutId = setTimeout(preloadAll, 150);
    return () => {
      if (typeof cancelIdleCallback !== 'undefined' && idleId) cancelIdleCallback(idleId);
      clearTimeout(timeoutId);
    };
  }, []);

  // Update document metadata when public page changes
  useEffect(() => {
    const title = publicPage ? PUBLIC_PAGE_META[publicPage].title : APP_TITLE;
    const description = publicPage ? PUBLIC_PAGE_META[publicPage].description : APP_DESCRIPTION;
    const siteOrigin = SITE_URL ?? window.location.origin;
    const canonicalHref = publicPage
      ? `${siteOrigin}${import.meta.env.BASE_URL}#${publicPage}`
      : `${siteOrigin}${window.location.pathname}${window.location.search}`;
    const socialImage = `${siteOrigin}${import.meta.env.BASE_URL}social-preview.svg`;

    document.title = title;

    const descriptionMeta = document.head.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (descriptionMeta) {
      descriptionMeta.content = description;
    }

    const canonicalLink = document.head.querySelector('#canonical-url') as HTMLLinkElement | null;
    if (canonicalLink) {
      canonicalLink.href = canonicalHref;
    }

    upsertMetaTag('property', 'og:title', title);
    upsertMetaTag('property', 'og:description', description);
    upsertMetaTag('property', 'og:url', canonicalHref);
    upsertMetaTag('property', 'og:image', socialImage);
    upsertMetaTag('property', 'og:site_name', APP_TITLE);
    upsertMetaTag('name', 'twitter:title', title);
    upsertMetaTag('name', 'twitter:description', description);
    upsertMetaTag('name', 'twitter:image', socialImage);

    upsertStructuredData('app-structured-data', {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: APP_TITLE,
      description,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      url: canonicalHref,
      image: socialImage,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    });
  }, [publicPage]);

  const clearPublicHash = useCallback(() => {
    if (getPublicPageFromHash(window.location.hash.slice(1))) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  }, []);

  const openPublicPage = useCallback((page: PublicPage) => {
    setPublicPage(page);
    setSrAnnouncement(`${PUBLIC_PAGE_META[page].label} page`);
    if (window.location.hash !== `#${page}`) {
      window.location.hash = page;
    }
  }, []);

  const closePublicPage = useCallback(() => {
    setPublicPage(null);
    setSrAnnouncement('Returned to app');
    clearPublicHash();
  }, [clearPublicHash]);

  const handleViewChange = useCallback((newView: AppView) => {
    const labels: Record<string, string> = {
      scan: 'Scanner view',
      library: 'Library view',
      data: 'Import and export view',
      profile: 'Profile view',
    };
    setPublicPage(null);
    clearPublicHash();
    setView(newView);
    setSrAnnouncement(labels[newView]);
    addBreadcrumb('navigation', 'View changed', { view: newView });
  }, [clearPublicHash]);

  return {
    view,
    publicPage,
    openBookIsbn,
    setOpenBookIsbn,
    srAnnouncement,
    openPublicPage,
    closePublicPage,
    handleViewChange,
  };
}
