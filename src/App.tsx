import { useState, useEffect, useLayoutEffect, useCallback, useRef, lazy, Suspense, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import AuthPanel from './components/AuthPanel.tsx';
import ThemeToggle from './components/ThemeToggle.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { useBookLookup } from './hooks/useBookLookup.ts';
import { useBookStore } from './store/useBookStore.ts';
import { useAuthStore } from './store/useAuthStore.ts';
import { useProfileStore } from './store/useProfileStore.ts';
import { useSyncQueue } from './store/useSyncQueue.ts';
import { useOnlineStatus } from './hooks/useOnlineStatus.ts';
import { useTheme } from './hooks/useTheme.ts';
import { useToast } from './components/Toast.tsx';
import { mergeSync, pushBooks } from './lib/syncBooks.ts';
import { formatRelativeTime } from './utils/formatRelativeTime.ts';
import type { BookEntry } from './types.ts';
import { BookOpen, Library, Scan, AlertCircle, Layers, User, Sparkles, Cloud, BookMarked, ChevronRight, Home } from 'lucide-react';
import { generateAmazonLink } from './utils/amazonLink.ts';
import { isValidIsbn, normalizeToIsbn13 } from './utils/isbnValidation.ts';
import { isbnExistsInLibrary } from './utils/libraryUtils.ts';
import { useAnalyticsStore } from './store/useAnalyticsStore.ts';
import { getLibraryInsights } from './utils/bookPresentation.ts';
import PublicInfoPage, { type PublicPage } from './components/PublicInfoPage.tsx';
import PwaInstallPrompt from './components/PwaInstallPrompt.tsx';
import OnboardingModal from './components/OnboardingModal.tsx';
import { DEFAULT_ONBOARDING_STEPS } from './components/onboardingContent.tsx';
import { addBreadcrumb, captureException, isEnabled as isMonitoringEnabled, setTag, setUser as setMonitoringUser } from './lib/errorMonitoring.ts';
import { isSupabaseConfigured } from './lib/supabase.ts';
import { isMvpMode } from './lib/appMode.ts';
import { buildSupportDiagnostics } from './utils/supportDiagnostics.ts';
import styles from './components/App.module.css';
import { uiContracts } from './testing/uiContracts.ts';

const Scanner = lazy(() => import('./components/Scanner.tsx'));
const LibraryList = lazy(() => import('./components/LibraryList.tsx'));
const HomeFeed = lazy(() => import('./components/HomeFeed.tsx'));
const DataManagement = lazy(() => import('./components/DataManagement.tsx'));
const ProfileSettings = lazy(() => import('./components/ProfileSettings.tsx'));
const PasswordReset = lazy(() => import('./components/PasswordReset.tsx'));
const preloadScanner = () => import('./components/Scanner.tsx');
const preloadLibrary = () => import('./components/LibraryList.tsx');
const preloadHome = () => import('./components/HomeFeed.tsx');
const preloadData = () => import('./components/DataManagement.tsx');
const preloadProfile = () => import('./components/ProfileSettings.tsx');

type ScanRequestOptions = {
  allowReview?: boolean;
  source?: 'scan' | 'manual' | 'ocr' | 'barcode' | 'suggestion';
};

type AppView = 'home' | 'scan' | 'library' | 'profile';

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined;
const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '');
const APP_DESCRIPTION = 'Digitize and manage your personal book library with barcode scanning, OCR fallback, optional cloud sync, and export-friendly ownership.';
const APP_TITLE = 'SpineScanner';
const APP_RELEASE = import.meta.env.VITE_APP_RELEASE || 'dev-local';
const APP_ENV = import.meta.env.VITE_APP_ENV || import.meta.env.MODE;

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

function getPublicPageFromHash(hash: string): PublicPage | null {
  if (hash === 'about' || hash === 'privacy' || hash === 'terms' || hash === 'support') {
    return hash;
  }

  return null;
}

function getPublicPageFromPath(pathname: string): PublicPage | null {
  const parts = pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  if (last === 'about' || last === 'privacy' || last === 'terms' || last === 'support') {
    return last;
  }
  return null;
}

/** One line under the logo — changes with route so each area feels distinct. */
const ROUTE_BRANDING_SUBTITLE: Record<string, string> = {
  '/home': 'Your reading feed, library snapshot, and quick paths to scan.',
  '/scan': 'A friendlier home for scanning, organizing, and finding books fast.',
  '/library': 'Browse, search, and organize your saved books.',
  '/data': 'Import, export, and back up your library.',
  '/profile': 'Account, cloud sync, import/export, and app preferences.',
};

function getBrandingSubtitle(pathname: string, publicPage: PublicPage | null): string {
  if (publicPage) {
    return `${PUBLIC_PAGE_META[publicPage].label} · ${APP_TITLE}`;
  }
  return ROUTE_BRANDING_SUBTITLE[pathname] ?? ROUTE_BRANDING_SUBTITLE['/scan'];
}

function getDocumentTitle(pathname: string, publicPage: PublicPage | null): string {
  if (publicPage) return PUBLIC_PAGE_META[publicPage].title;
  const inner: Record<string, string> = {
    '/home': `Home · ${APP_TITLE}`,
    '/scan': APP_TITLE,
    '/library': `Library · ${APP_TITLE}`,
    '/data': `Data · ${APP_TITLE}`,
    '/profile': `Profile · ${APP_TITLE}`,
  };
  return inner[pathname] ?? APP_TITLE;
}

function AppLibraryRoute({
  onStartScanning,
}: {
  onStartScanning: () => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isbn = searchParams.get('isbn');
  const series = searchParams.get('series');
  const onOpenComplete = useCallback(() => {
    if (!isbn) return;
    const next = new URLSearchParams(searchParams);
    next.delete('isbn');
    setSearchParams(next, { replace: true });
  }, [isbn, searchParams, setSearchParams]);

  return (
    <LibraryList
      onStartScanning={onStartScanning}
      initialOpenIsbn={isbn}
      onOpenComplete={onOpenComplete}
      initialSeriesFilter={series}
    />
  );
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

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const publicPage = getPublicPageFromPath(location.pathname);
  const showMarketingHero = location.pathname === '/scan' && !isMvpMode();
  const brandingSubtitle = getBrandingSubtitle(location.pathname, publicPage);
  const { lookupByIsbn, loading, error } = useBookLookup();
  const { addBook, books, setBooks, shelves, setShelves } = useBookStore();
  const { user, recoveryMode, initialize: initAuth } = useAuthStore();
  const { preferences, loadFromCloud, saveToCloud, updatePreferences } = useProfileStore();
  const { pendingChanges, markDirty, markSynced, markSyncFailed, flushing, setFlushing } = useSyncQueue();
  const lastSyncFailedAt = useSyncQueue((s) => s.lastSyncFailedAt);
  const lastSyncedAt = useSyncQueue((s) => s.lastSyncedAt);
  const syncFailedRecently = lastSyncFailedAt != null && Date.now() - lastSyncFailedAt < 90_000;
  const { online, justReconnected, clearReconnected } = useOnlineStatus();
  const { themePreference, toggleTheme } = useTheme();
  const { toast, confirm } = useToast();
  const { track } = useAnalyticsStore();
  const [srAnnouncement, setSrAnnouncement] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const batchMode = preferences.batchModeDefault;
  const insights = useMemo(() => getLibraryInsights(books), [books]);
  const diagnostics = useMemo(() => buildSupportDiagnostics({
    release: APP_RELEASE,
    environment: APP_ENV,
    basePath: import.meta.env.BASE_URL,
    siteUrl: SITE_URL ?? null,
    online,
    hasUser: Boolean(user?.id),
    pendingChanges,
    lastSyncedAt,
    lastSyncFailedAt,
    monitoringEnabled: isMonitoringEnabled(),
    supabaseConfigured: isSupabaseConfigured(),
    totalBooks: books.length,
    totalShelves: shelves.length,
    reviewCount: insights.reviewCount,
    currentView: publicPage ?? location.pathname,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    language: typeof navigator !== 'undefined' ? navigator.language : 'unknown',
  }), [books.length, insights.reviewCount, lastSyncFailedAt, lastSyncedAt, location.pathname, online, pendingChanges, publicPage, shelves.length, user?.id]);

  const mainRef = useRef<HTMLElement>(null);
  const initialSyncDone = useRef(false);
  const prevBooksRef = useRef(books);
  const prevShelvesRef = useRef(shelves);
  const batchBooksAddedRef = useRef(0);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  useEffect(() => {
    setMonitoringUser(user?.id ?? null);
    setTag('has_cloud_account', Boolean(user?.id));
  }, [user?.id]);

  useEffect(() => {
    setTag('app_mode', isMvpMode() ? 'mvp' : 'full');
  }, []);

  useEffect(() => {
    try {
      const legacy = localStorage.getItem('spine-scanner-theme');
      if (legacy === 'light' || legacy === 'dark') {
        localStorage.removeItem('spine-scanner-theme');
        updatePreferences({ theme: legacy });
      }
    } catch {
      // ignore
    }
  }, [updatePreferences]);

  useEffect(() => {
    if (user?.id) {
      loadFromCloud(user.id);
    }
  }, [user?.id, loadFromCloud]);

  useEffect(() => {
    if (!preferences.onboardingCompleted && books.length > 0) {
      updatePreferences({ onboardingCompleted: true });
    }
  }, [preferences.onboardingCompleted, books.length, updatePreferences]);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!user?.id) return;
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveToCloud(user.id), 800);
    return () => { clearTimeout(saveTimeoutRef.current); };
  }, [user?.id, preferences, saveToCloud]);

  /** One-time migration from hash URLs (#book-…, #about) to path routes. */
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;

    const fromHashPublic = getPublicPageFromHash(hash);
    if (fromHashPublic) {
      navigate(`/${fromHashPublic}`, { replace: true });
      return;
    }

    const m = hash.match(/^book-(.+)$/);
    if (m) {
      const isbn = decodeURIComponent(m[1]);
      if (isbn) {
        navigate(`/library?isbn=${encodeURIComponent(isbn)}`, { replace: true });
      }
    }
  }, [navigate]);

  /** After route changes, bring the viewport back to the top (respect reduced motion). */
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const instant = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, left: 0, behavior: instant ? 'instant' : 'smooth' });
  }, [location.pathname]);

  useEffect(() => {
    const preloadAll = () => {
      if (!isMvpMode()) void preloadHome();
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

  useEffect(() => {
    if (!user) {
      initialSyncDone.current = false;
      return;
    }
    let cancelled = false;

    const doInitialSync = async () => {
      setFlushing(true);
      const merged = await mergeSync(user.id, books, shelves);
      if (!cancelled && merged) {
        setBooks(merged.books);
        setShelves(merged.shelves);
        markSynced();
      }
      if (!cancelled) {
        setFlushing(false);
        initialSyncDone.current = true;
        prevBooksRef.current = merged?.books ?? books;
        prevShelvesRef.current = merged?.shelves ?? shelves;
      }
    };

    void doInitialSync();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!user || !initialSyncDone.current) return;
    if (books !== prevBooksRef.current || shelves !== prevShelvesRef.current) {
      markDirty();
    }
    prevBooksRef.current = books;
    prevShelvesRef.current = shelves;
  }, [books, shelves, user, markDirty]);

  const flushQueue = useCallback(async (): Promise<boolean> => {
    if (!user || flushing) return false;
    setFlushing(true);
    try {
      addBreadcrumb('sync', 'Attempting queue flush', {
        pendingChanges,
        hasUser: Boolean(user),
      });
      const merged = await mergeSync(user.id, books, shelves);
      if (merged) {
        setBooks(merged.books);
        setShelves(merged.shelves);
        markSynced();
        prevBooksRef.current = merged.books;
        prevShelvesRef.current = merged.shelves;
        addBreadcrumb('sync', 'Queue flush succeeded', {
          books: merged.books.length,
          shelves: merged.shelves.length,
        });
        return true;
      }
    } catch (err) {
      console.error('[sync] Flush failed:', err);
      captureException(err, {
        area: 'flushQueue',
        pendingChanges,
        localBookCount: books.length,
        localShelfCount: shelves.length,
      });
      markSyncFailed();
      toast('Sync failed. Will retry when online.', 'error');
    } finally {
      setFlushing(false);
    }
    return false;
  }, [user, flushing, books, shelves, setBooks, setShelves, markSynced, markSyncFailed, setFlushing, toast, pendingChanges]);

  useEffect(() => {
    if (!justReconnected) return;
    const wasReconnect = true;
    clearReconnected();
    if (user && pendingChanges > 0 && !flushing) {
      void flushQueue().then((ok) => {
        if (ok && wasReconnect) toast('Back online – changes synced', 'success');
      });
    }
  }, [justReconnected, user, pendingChanges, flushing, clearReconnected, flushQueue, toast]);

  const handleSyncNow = useCallback(async () => {
    if (!user) return;
    await flushQueue();
  }, [user, flushQueue]);

  const completeOnboarding = useCallback(() => {
    setShowOnboarding(false);
    updatePreferences({ onboardingCompleted: true });
  }, [updatePreferences]);

  const openPublicPage = useCallback((page: PublicPage) => {
    navigate(`/${page}`);
    setSrAnnouncement(`${PUBLIC_PAGE_META[page].label} page`);
  }, [navigate]);

  const closePublicPage = useCallback(() => {
    navigate('/home');
    setSrAnnouncement('Returned to app');
  }, [navigate]);

  const goToMain = useCallback((path: '/home' | '/scan' | '/library' | '/data' | '/profile', announcement: string) => {
    navigate(path);
    setSrAnnouncement(announcement);
    addBreadcrumb('navigation', 'Route changed', { path });
  }, [navigate]);

  const handlePhotoCapture = useCallback((imageDataUrl: string) => {
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2);
    const photoIsbn = `photo-${id}`;
    const newBook: BookEntry = {
      id,
      isbn: photoIsbn,
      isPhotoOnly: true,
      title: 'Unknown Title',
      author: 'Unknown Author',
      pageCount: 0,
      amazonLink: '',
      coverImg: imageDataUrl,
      status: 'to-read',
      notes: '',
      dateAdded: new Date().toISOString(),
      shelfIds: [],
      needsReview: true,
      reviewReason: 'Photo-only capture. Add metadata when ready.',
      metadataSource: 'manual',
    };
    addBook(newBook);
    track('book_added', { method: 'photo' });
    toast('Book added with photo. Edit details in your library.', 'success');
    if (user && online) {
      void pushBooks(user.id, [...books, newBook]).catch(() => toast('Cloud sync failed. Changes saved locally.', 'warning'));
    }
    navigate(`/library?isbn=${encodeURIComponent(photoIsbn)}`);
  }, [addBook, books, user, online, toast, track, navigate]);

  useEffect(() => {
    if (isMvpMode()) {
      setShowOnboarding(false);
      return;
    }
    if (publicPage) {
      setShowOnboarding(false);
      return;
    }

    if (!preferences.onboardingCompleted && books.length === 0) {
      setShowOnboarding(true);
    }
  }, [preferences.onboardingCompleted, books.length, publicPage]);

  useEffect(() => {
    if (!batchMode) batchBooksAddedRef.current = 0;
  }, [batchMode]);

  const addBookAndOpen = useCallback((newBook: BookEntry, successMessage: string, trackMethod: string, forceOpen = false) => {
    addBook(newBook);
    track('book_added', { method: trackMethod, isbn: newBook.isbn });
    const viewLibrary = () => { navigate(`/library?isbn=${encodeURIComponent(newBook.isbn)}`); };
    if (batchMode && !forceOpen) {
      toast('Added. Ready for the next book.', 'success', 4000, undefined, { label: 'View in Library', onClick: viewLibrary });
      batchBooksAddedRef.current += 1;
      if (batchBooksAddedRef.current === 1) {
        toast("Batch mode: you'll stay on scanner. Tap Library when done.", 'info', 4500);
      }
    } else {
      toast(successMessage, 'success');
      navigate(`/library?isbn=${encodeURIComponent(newBook.isbn)}`);
    }

    if (user && online) {
      void pushBooks(user.id, [...books, newBook]).catch(() => toast('Cloud sync failed. Changes saved locally.', 'warning'));
    }
  }, [addBook, batchMode, books, navigate, online, toast, track, user]);

  const handleScan = async (isbn: string, options: ScanRequestOptions = {}) => {
    const normalizedInput = isbn.replace(/[^0-9Xx]/g, '').replace(/x$/i, 'X') || isbn;
    const isChecksumValid = isValidIsbn(normalizedInput);
    const canReviewInvalid = options.allowReview === true && !isChecksumValid;

    if (preferences.warnOnDuplicateIsbn !== false && isbnExistsInLibrary(normalizedInput, books)) {
      if (batchMode && options.source !== 'manual') {
        toast('Already in your library. Keep scanning.', 'info');
        return;
      }
      const openInLibrary = await confirm({
        title: 'Book already in library',
        message: 'You already added this book. Open it in your library instead?',
        confirmLabel: 'Open in library',
        cancelLabel: 'Dismiss',
      });
      if (openInLibrary) {
        navigate(`/library?isbn=${encodeURIComponent(normalizedInput)}`);
      }
      return;
    }

    if (!isChecksumValid) {
      if (!canReviewInvalid) {
        toast('That ISBN looks incomplete. Try again or add it for review.', 'error');
        return;
      }

      const reviewBook: BookEntry = {
        id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        isbn: normalizedInput,
        title: 'Review ISBN Entry',
        author: 'Manual Entry',
        pageCount: 0,
        amazonLink: generateAmazonLink(normalizedInput),
        coverImg: '',
        status: 'to-read',
        notes: 'Added from manual ISBN entry. Verify the ISBN and complete the details.',
        dateAdded: new Date().toISOString(),
        shelfIds: [],
        needsReview: true,
        reviewReason: 'Manual ISBN needs verification.',
        metadataSource: 'manual',
      };

      addBookAndOpen(reviewBook, 'Added for review. Open the book to verify the ISBN and details.', 'manual_review', true);
      return;
    }

    try {
      const metadata = await lookupByIsbn(normalizedInput);
      if (metadata) {
        const storedIsbn = normalizeToIsbn13(metadata.isbn);
        const newBook: BookEntry = {
          id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2),
          isbn: storedIsbn,
          title: metadata.title,
          author: metadata.authors.join(', '),
          pageCount: metadata.pageCount,
          amazonLink: generateAmazonLink(storedIsbn),
          coverImg: metadata.thumbnail,
          status: 'to-read',
          notes: '',
          dateAdded: new Date().toISOString(),
          shelfIds: [],
          metadataSource: metadata.source,
        };
        addBookAndOpen(newBook, `Added "${metadata.title}" to your library.`, options.source === 'manual' ? 'manual' : 'scan', options.source === 'manual');
      } else {
        const addAnyway = await confirm({
          title: 'No metadata found',
          message: `We couldn't find details for ISBN ${normalizedInput}. Add it anyway so you can fill them in manually?`,
          confirmLabel: 'Add anyway',
          cancelLabel: 'Cancel',
        });
        if (addAnyway) {
          const storedIsbn = normalizeToIsbn13(normalizedInput);
          const newBook: BookEntry = {
            id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2),
            isbn: storedIsbn,
            title: 'Unknown Title',
            author: 'Unknown Author',
            pageCount: 0,
            amazonLink: generateAmazonLink(storedIsbn),
            coverImg: '',
            status: 'to-read',
            notes: '',
            dateAdded: new Date().toISOString(),
            shelfIds: [],
            needsReview: true,
            reviewReason: 'Metadata not found. Add details manually.',
            metadataSource: 'manual',
          };
          addBookAndOpen(newBook, 'Added with ISBN only. You can fill in the details in your library.', options.source === 'manual' ? 'manual_no_metadata' : 'scan_no_metadata', options.source === 'manual');
        } else {
          toast('No metadata found for that ISBN.', 'error');
        }
      }
    } catch (err) {
      console.error('[App] Error during scan handler:', err);
      toast('Book lookup failed. Try again or add the ISBN manually.', 'error');
    }
  };

  useEffect(() => {
    const title = getDocumentTitle(location.pathname, publicPage);
    const description = publicPage ? PUBLIC_PAGE_META[publicPage].description : APP_DESCRIPTION;
    const siteOrigin = SITE_URL ?? window.location.origin;
    const basePath = import.meta.env.BASE_URL.replace(/\/?$/, '');
    const canonicalHref = publicPage
      ? `${siteOrigin}${basePath}/${publicPage}`
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
  }, [publicPage, location.pathname, location.search]);

  const navItems: Array<{ key: AppView; label: string; shortLabel: string; icon: ReactNode; fab?: boolean }> = [
    ...(isMvpMode()
      ? []
      : [{ key: 'home' as const, label: 'Home', shortLabel: 'Home', icon: <Home size={20} strokeWidth={2} aria-hidden /> }]),
    { key: 'library', label: 'Library', shortLabel: 'Library', icon: <Library size={20} strokeWidth={2} aria-hidden /> },
    { key: 'scan', label: 'Add books', shortLabel: 'Add', icon: <Scan size={22} strokeWidth={2} aria-hidden />, fab: true },
    { key: 'profile', label: 'Profile', shortLabel: 'Profile', icon: <User size={20} strokeWidth={2} aria-hidden /> },
  ];

  return (
    <div className="app-container">
      <a
        href="#main-content"
        className={styles.skipLink}
        onClick={() => {
          queueMicrotask(() => {
            mainRef.current?.focus({ preventScroll: true });
          });
        }}
      >
        Skip to main content
      </a>

      <div className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
        {srAnnouncement}
      </div>

      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.branding}>
            <NavLink
              to={isMvpMode() ? '/scan' : '/home'}
              className={styles.brandLinkBlock}
              aria-label={isMvpMode() ? 'SpineScanner — Add books' : 'SpineScanner home — Feed'}
              onClick={() => setSrAnnouncement(isMvpMode() ? 'Scanner view' : 'Home feed')}
            >
              <div className={styles.logoBox}>
                <BookOpen size={28} color="white" aria-hidden />
              </div>
              <div className={styles.brandCopy}>
                <h1 className={styles.appTitle}>
                  Spine<span className={styles.titleAccent}>Scanner</span>
                </h1>
                <p className={styles.subtitle}>{brandingSubtitle}</p>
              </div>
            </NavLink>
          </div>

          <div className={styles.headerRight}>
            <nav className={styles.headerQuickNav} aria-label="Quick links">
              <NavLink
                to="/library"
                end
                aria-label="Book library"
                className={({ isActive }) =>
                  `${styles.headerQuickLink} ${isActive ? styles.headerQuickLinkActive : ''}`.trim()}
                onClick={() => {
                  setSrAnnouncement('Library view');
                  addBreadcrumb('navigation', 'Route changed', { path: '/library' });
                }}
                onMouseEnter={() => { void preloadLibrary(); }}
                onFocus={() => { void preloadLibrary(); }}
              >
                <Library size={16} strokeWidth={2} aria-hidden />
                <span className={styles.headerQuickLinkText}>Book library</span>
              </NavLink>
              <NavLink
                to="/scan"
                end
                aria-label="Add books"
                className={({ isActive }) =>
                  `${styles.headerQuickLink} ${isActive ? styles.headerQuickLinkActive : ''}`.trim()}
                onClick={() => {
                  setSrAnnouncement('Scanner view');
                  addBreadcrumb('navigation', 'Route changed', { path: '/scan' });
                }}
                onMouseEnter={() => { void preloadScanner(); }}
                onFocus={() => { void preloadScanner(); }}
              >
                <Scan size={16} strokeWidth={2} aria-hidden />
                <span className={styles.headerQuickLinkText}>Add</span>
              </NavLink>
              <NavLink
                to="/profile"
                end
                aria-label="Profile"
                className={({ isActive }) =>
                  `${styles.headerQuickLink} ${isActive ? styles.headerQuickLinkActive : ''}`.trim()}
                onClick={() => {
                  setSrAnnouncement('Profile view');
                  addBreadcrumb('navigation', 'Route changed', { path: '/profile' });
                }}
                onMouseEnter={() => { void preloadProfile(); }}
                onFocus={() => { void preloadProfile(); }}
              >
                <User size={16} strokeWidth={2} aria-hidden />
                <span className={styles.headerQuickLinkText}>Profile</span>
              </NavLink>
            </nav>
            {isSupabaseConfigured() && user && pendingChanges > 0 && (
              <button
                type="button"
                className={styles.headerSyncPill}
                onClick={() => void handleSyncNow()}
                disabled={flushing || !online}
                aria-label={
                  pendingChanges === 1
                    ? 'Sync one pending change to the cloud'
                    : `Sync ${pendingChanges} pending changes to the cloud`
                }
              >
                {flushing ? 'Syncing…' : !online ? 'Offline' : `${pendingChanges} to sync`}
              </button>
            )}
            <ThemeToggle themePreference={themePreference} onToggle={toggleTheme} />
            <AuthPanel
              onSyncNow={handleSyncNow}
              syncing={flushing}
              lastSyncedAt={lastSyncedAt}
              online={online}
              pendingChanges={pendingChanges}
              syncFailedRecently={syncFailedRecently}
              onOpenProfile={() => goToMain('/profile', 'Profile view')}
            />
          </div>
        </div>

        {showMarketingHero && (
          <>
            <section className={`glass ${styles.hero}`} aria-label="Book site overview">
              <div className={styles.heroIntro}>
                <span className={styles.eyebrow}><Sparkles size={14} /> Reader-first workflow</span>
                <h2 className={styles.heroTitle}>Add books in seconds and browse them like a real library.</h2>
                <p className={styles.heroText}>
                  Scan a spine, upload a photo, or type an ISBN. The app keeps your collection searchable, synced, and easy to return to.
                </p>
                <div className={styles.heroActions}>
                  <button type="button" className={`glass ${styles.primaryAction}`} onClick={() => goToMain('/scan', 'Scanner view')}>
                    <Scan size={18} /> Start scanning
                  </button>
                  <button type="button" className={`glass ${styles.secondaryAction}`} onClick={() => goToMain('/library', 'Library view')}>
                    <Library size={18} /> Browse library
                  </button>
                </div>
              </div>

              <div className={styles.heroStats}>
                <div className={`glass ${styles.statCard}`}>
                  <span className={styles.statLabel}>Books saved</span>
                  <strong>{insights.totalBooks}</strong>
                  <span>{insights.toReadCount} still on deck</span>
                </div>
                <div className={`glass ${styles.statCard}`}>
                  <span className={styles.statLabel}>Reading now</span>
                  <strong>{insights.currentlyReading?.title ?? 'Nothing pinned yet'}</strong>
                  <span>{insights.currentlyReading?.author ?? 'Mark a title as reading to keep it visible.'}</span>
                </div>
                <div className={`glass ${styles.statCard}`}>
                  <span className={styles.statLabel}>Sync status</span>
                  <strong>{online ? 'Online' : 'Offline'}</strong>
                  <span>{pendingChanges > 0 ? `${pendingChanges} change${pendingChanges === 1 ? '' : 's'} to sync` : lastSyncedAt ? `Synced ${formatRelativeTime(lastSyncedAt)}` : 'Everything is up to date.'}</span>
                </div>
              </div>
            </section>

            <section className={styles.quickGuide} aria-label="How it works">
              <div className={`glass ${styles.guideCard}`}>
                <Scan size={18} />
                <div>
                  <strong>1. Add a book</strong>
                  <p>Scan live, snap a photo, or type the ISBN if the camera misses.</p>
                </div>
              </div>
              <div className={`glass ${styles.guideCard}`}>
                <BookMarked size={18} />
                <div>
                  <strong>2. Organize it</strong>
                  <p>Track reading status, notes, and shelves without leaving the library view.</p>
                </div>
              </div>
              <div className={`glass ${styles.guideCard}`}>
                <Cloud size={18} />
                <div>
                  <strong>3. Pick up anywhere</strong>
                  <p>Your collection stays searchable and syncs when you reconnect.</p>
                </div>
              </div>
            </section>
          </>
        )}

        <nav className={`glass ${styles.nav}`} aria-label="Main navigation">
          {navItems.map(({ key, label, shortLabel, icon, fab }) => {
            const to = `/${key}`;
            const announcements: Record<AppView, string> = {
              home: 'Home feed',
              scan: 'Scanner view',
              library: 'Library view',
              profile: 'Profile view',
            };
            return (
              <NavLink
                key={key}
                to={to}
                end
                aria-label={fab ? label : undefined}
                onClick={() => { setSrAnnouncement(announcements[key]); addBreadcrumb('navigation', 'Route changed', { path: to }); }}
                onMouseEnter={() => {
                  if (key === 'home') void preloadHome();
                  if (key === 'scan') void preloadScanner();
                  if (key === 'library') void preloadLibrary();
                  if (key === 'profile') void preloadProfile();
                }}
                onFocus={() => {
                  if (key === 'home') void preloadHome();
                  if (key === 'scan') void preloadScanner();
                  if (key === 'library') void preloadLibrary();
                  if (key === 'profile') void preloadProfile();
                }}
                className={({ isActive }) =>
                  `${styles.navBtn} ${fab ? styles.navBtnFab : ''} ${isActive ? styles.navBtnActive : ''}`.trim()}
                data-testid={uiContracts.navTabTestId(key)}
              >
                <span className={fab ? styles.navFabIcon : styles.navIcon}>{icon}</span>
                <span className={styles.navLabel}>{shortLabel}</span>
              </NavLink>
            );
          })}
        </nav>
      </header>

      <main ref={mainRef} id="main-content" className={styles.mainContent} tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Navigate to={isMvpMode() ? '/scan' : '/home'} replace />} />
          <Route
            path="/about"
            element={(
              <PublicInfoPage
                page="about"
                supportEmail={SUPPORT_EMAIL}
                diagnostics={null}
                onClose={closePublicPage}
              />
            )}
          />
          <Route
            path="/privacy"
            element={(
              <PublicInfoPage
                page="privacy"
                supportEmail={SUPPORT_EMAIL}
                diagnostics={null}
                onClose={closePublicPage}
              />
            )}
          />
          <Route
            path="/terms"
            element={(
              <PublicInfoPage
                page="terms"
                supportEmail={SUPPORT_EMAIL}
                diagnostics={null}
                onClose={closePublicPage}
              />
            )}
          />
          <Route
            path="/support"
            element={(
              <PublicInfoPage
                page="support"
                supportEmail={SUPPORT_EMAIL}
                diagnostics={diagnostics}
                onClose={closePublicPage}
              />
            )}
          />
          <Route
            path="/home"
            element={(
              <ErrorBoundary>
                <Suspense fallback={<div className={styles.lazyFallback}><div className={styles.skeletonBlock} /><div className={styles.skeletonGrid}><span /><span /><span /></div></div>}>
                  <HomeFeed />
                </Suspense>
              </ErrorBoundary>
            )}
          />
          <Route
            path="/scan"
            element={(
              <ErrorBoundary>
                <Suspense fallback={<div className={styles.lazyFallback}><div className={styles.skeletonBlock} /><div className={styles.skeletonGrid}><span /><span /><span /></div></div>}>
                  <div className={styles.scanView}>
                    <div className={styles.scanHeader}>
                      <div>
                        <span className={styles.sectionBadge}>Add books</span>
                        <h2 className={styles.scanTitle}>Three easy ways to capture a book</h2>
                        <p className={styles.scanSubtitle}>Use the camera for speed, upload a photo for tricky spines, or type the ISBN when you want full control.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => updatePreferences({ batchModeDefault: !batchMode })}
                        className={`glass ${styles.batchToggle} ${batchMode ? styles.batchToggleActive : ''}`}
                        aria-pressed={batchMode}
                        title={batchMode ? 'Exit batch mode' : 'Batch add keeps you on the scanner after each add'}
                      >
                        <Layers size={18} />
                        {batchMode ? 'Batch mode on' : 'Batch add'}
                      </button>
                    </div>

                    <div className={styles.scanTips}>
                      <div className={`glass ${styles.tipCard}`}>
                        <strong>Best for speed</strong>
                        <span>Center the barcode and hold still for a second.</span>
                      </div>
                      <div className={`glass ${styles.tipCard}`}>
                        <strong>Best for hard covers</strong>
                        <span>Use photo upload when the spine text is small or reflective.</span>
                      </div>
                      <button type="button" className={`glass ${styles.tipCard} ${styles.tipCardButton}`} onClick={() => goToMain('/library', 'Library view')}>
                        <strong>Already scanned enough?</strong>
                        <span>Jump to your library <ChevronRight size={14} /></span>
                      </button>
                    </div>

                    <Scanner
                      onScan={handleScan}
                      onPhotoCapture={handlePhotoCapture}
                      isScanning={loading}
                      batchMode={batchMode}
                      onOpenSupport={() => openPublicPage('support')}
                      onOpenPrivacy={() => openPublicPage('privacy')}
                      onViewLibrary={(isbn) => {
                        navigate(isbn ? `/library?isbn=${encodeURIComponent(isbn)}` : '/library');
                      }}
                    />

                    {error && (
                      <div className={`glass ${styles.alertError}`}>
                        <AlertCircle size={20} />
                        <span>{error}</span>
                      </div>
                    )}
                  </div>
                </Suspense>
              </ErrorBoundary>
            )}
          />
          <Route
            path="/library"
            element={(
              <ErrorBoundary>
                <Suspense fallback={<div className={styles.lazyFallback}><div className={styles.skeletonBlock} /><div className={styles.skeletonGrid}><span /><span /><span /></div></div>}>
                  <AppLibraryRoute
                    onStartScanning={() => goToMain('/scan', 'Scanner view')}
                  />
                </Suspense>
              </ErrorBoundary>
            )}
          />
          <Route
            path="/data"
            element={(
              <ErrorBoundary>
                <Suspense fallback={<div className={styles.lazyFallback}><div className={styles.skeletonBlock} /><div className={styles.skeletonGrid}><span /><span /><span /></div></div>}>
                  <DataManagement onClose={() => goToMain('/profile', 'Profile view')} />
                </Suspense>
              </ErrorBoundary>
            )}
          />
          <Route
            path="/profile"
            element={(
              <ErrorBoundary>
                <Suspense fallback={<div className={styles.lazyFallback}><div className={styles.skeletonBlock} /><div className={styles.skeletonGrid}><span /><span /><span /></div></div>}>
                  <ProfileSettings inline />
                </Suspense>
              </ErrorBoundary>
            )}
          />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </main>

      <OnboardingModal
        open={showOnboarding}
        steps={DEFAULT_ONBOARDING_STEPS.map((step) => ({
          ...step,
          onCta: step.id === 'scan'
            ? () => goToMain('/scan', 'Scanner view')
            : step.id === 'organize'
              ? () => goToMain('/library', 'Library view')
              : step.onCta,
        }))}
        onClose={completeOnboarding}
      />


      <PwaInstallPrompt />

      <footer className={`glass ${styles.siteFooter}`}>
        <div>
          <strong>SpineScanner</strong>
          <p className={styles.footerNote}>Offline-first book tracking with optional sync, exports, and readable trust pages for public visitors.</p>
          <p className={styles.footerNote}>Release {APP_RELEASE} · {APP_ENV}</p>
        </div>
        <div className={styles.footerLinks}>
          <button type="button" className={styles.footerButton} onClick={() => openPublicPage('about')}>About</button>
          <button type="button" className={styles.footerButton} onClick={() => openPublicPage('privacy')}>Privacy</button>
          <button type="button" className={styles.footerButton} onClick={() => openPublicPage('terms')}>Terms</button>
          <button type="button" className={styles.footerButton} onClick={() => openPublicPage('support')}>Support</button>
          {SUPPORT_EMAIL && (
            <a className={styles.footerButton} href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          )}
        </div>
      </footer>

      {recoveryMode && (
        <Suspense fallback={null}>
          <PasswordReset onComplete={() => useAuthStore.setState({ recoveryMode: false })} />
        </Suspense>
      )}

      <style>{`
        .app-container { opacity: 0; animation: fadeIn 0.8s ease-out forwards; }
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .app-container { opacity: 1; animation: none !important; }
          .animate-spin { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

export default App;
