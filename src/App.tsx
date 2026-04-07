import { useState, useEffect, useCallback, useRef, lazy, Suspense, useMemo } from 'react';
import type { ReactNode } from 'react';
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
import { BookOpen, Library, Scan, AlertCircle, Database, Layers, User, Sparkles, Cloud, BookMarked, ChevronRight } from 'lucide-react';
import { generateAmazonLink } from './utils/amazonLink.ts';
import { isValidIsbn, normalizeToIsbn13 } from './utils/isbnValidation.ts';
import { isbnExistsInLibrary } from './utils/libraryUtils.ts';
import { useAnalyticsStore } from './store/useAnalyticsStore.ts';
import { getLibraryInsights } from './utils/bookPresentation.ts';
import PublicInfoPage, { type PublicPage } from './components/PublicInfoPage.tsx';
import OnboardingModal from './components/OnboardingModal.tsx';
import { DEFAULT_ONBOARDING_STEPS } from './components/onboardingContent.tsx';
import { addBreadcrumb, captureException, isEnabled as isMonitoringEnabled, setTag, setUser as setMonitoringUser } from './lib/errorMonitoring.ts';
import { isSupabaseConfigured } from './lib/supabase.ts';
import { buildSupportDiagnostics } from './utils/supportDiagnostics.ts';
import styles from './components/App.module.css';
import { uiContracts } from './testing/uiContracts.ts';

const Scanner = lazy(() => import('./components/Scanner.tsx'));
const LibraryList = lazy(() => import('./components/LibraryList.tsx'));
const DataManagement = lazy(() => import('./components/DataManagement.tsx'));
const ProfileSettings = lazy(() => import('./components/ProfileSettings.tsx'));
const PasswordReset = lazy(() => import('./components/PasswordReset.tsx'));
const preloadScanner = () => import('./components/Scanner.tsx');
const preloadLibrary = () => import('./components/LibraryList.tsx');
const preloadData = () => import('./components/DataManagement.tsx');
const preloadProfile = () => import('./components/ProfileSettings.tsx');

type ScanRequestOptions = {
  allowReview?: boolean;
  source?: 'scan' | 'manual' | 'ocr' | 'barcode' | 'suggestion';
};

type AppView = 'scan' | 'library' | 'data' | 'profile';

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
  const [view, setView] = useState<AppView>('scan');
  const [publicPage, setPublicPage] = useState<PublicPage | null>(null);
  const { lookupByIsbn, loading, error } = useBookLookup();
  const { addBook, books, setBooks, shelves, setShelves } = useBookStore();
  const { user, recoveryMode, initialize: initAuth } = useAuthStore();
  const { preferences, loadFromCloud, saveToCloud, updatePreferences } = useProfileStore();
  const { pendingChanges, markDirty, markSynced, markSyncFailed, flushing, setFlushing } = useSyncQueue();
  const lastSyncFailedAt = useSyncQueue((s) => s.lastSyncFailedAt);
  const lastSyncedAt = useSyncQueue((s) => s.lastSyncedAt);
  const syncFailedRecently = lastSyncFailedAt != null && Date.now() - lastSyncFailedAt < 90_000;
  const { online, justReconnected, clearReconnected } = useOnlineStatus();
  const { theme, toggleTheme } = useTheme();
  const { toast, confirm } = useToast();
  const { track } = useAnalyticsStore();
  const [openBookIsbn, setOpenBookIsbn] = useState<string | null>(null);
  const [srAnnouncement, setSrAnnouncement] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
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
    currentView: publicPage ?? view,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    language: typeof navigator !== 'undefined' ? navigator.language : 'unknown',
  }), [books.length, insights.reviewCount, lastSyncFailedAt, lastSyncedAt, online, pendingChanges, publicPage, shelves.length, user?.id, view]);

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
    setOnboardingStep(0);
    updatePreferences({ onboardingCompleted: true });
  }, [updatePreferences]);

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
    };
    addBook(newBook);
    track('book_added', { method: 'photo' });
    toast('Book added with photo. Edit details in your library.', 'success');
    if (user && online) {
      void pushBooks(user.id, [...books, newBook]).catch(() => toast('Cloud sync failed. Changes saved locally.', 'warning'));
    }
    setOpenBookIsbn(photoIsbn);
    setView('library');
  }, [addBook, books, user, online, toast, track]);

  useEffect(() => {
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
    const viewLibrary = () => { setOpenBookIsbn(newBook.isbn); setView('library'); };
    if (batchMode && !forceOpen) {
      toast('Added. Ready for the next book.', 'success', 4000, undefined, { label: 'View in Library', onClick: viewLibrary });
      batchBooksAddedRef.current += 1;
      if (batchBooksAddedRef.current === 1) {
        toast("Batch mode: you'll stay on scanner. Tap Library when done.", 'info', 4500);
      }
    } else {
      toast(successMessage, 'success');
      setOpenBookIsbn(newBook.isbn);
      setView('library');
    }

    if (user && online) {
      void pushBooks(user.id, [...books, newBook]).catch(() => toast('Cloud sync failed. Changes saved locally.', 'warning'));
    }
  }, [addBook, batchMode, books, online, toast, track, user]);

  const handleScan = async (isbn: string, options: ScanRequestOptions = {}) => {
    const normalizedInput = isbn.replace(/[^0-9Xx]/g, '').replace(/x$/i, 'X') || isbn;
    const isChecksumValid = isValidIsbn(normalizedInput);
    const canReviewInvalid = options.allowReview === true && !isChecksumValid;

    if (isbnExistsInLibrary(normalizedInput, books)) {
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
        setOpenBookIsbn(normalizedInput);
        setView('library');
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

  const navItems: Array<{ key: AppView; label: string; icon: ReactNode }> = [
    { key: 'scan', label: 'Add Books', icon: <Scan size={18} /> },
    { key: 'library', label: 'Library', icon: <Library size={18} /> },
    { key: 'data', label: 'Import & Export', icon: <Database size={18} /> },
    { key: 'profile', label: 'Profile', icon: <User size={18} /> },
  ];

  return (
    <div className="app-container">
      <a href="#main-content" className={styles.skipLink}>Skip to main content</a>

      <div className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
        {srAnnouncement}
      </div>

      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.branding}>
            <div className={styles.logoBox}>
              <BookOpen size={28} color="white" />
            </div>
            <div>
              <h1 className={styles.appTitle}>
                Spine<span className={styles.titleAccent}>Scanner</span>
              </h1>
              <p className={styles.subtitle}>A friendlier home for scanning, organizing, and finding books fast.</p>
            </div>
          </div>

          <div className={styles.headerRight}>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <AuthPanel
              onSyncNow={handleSyncNow}
              syncing={flushing}
              lastSyncedAt={lastSyncedAt}
              online={online}
              pendingChanges={pendingChanges}
              syncFailedRecently={syncFailedRecently}
              onOpenProfile={() => handleViewChange('profile')}
            />
          </div>
        </div>

        <section className={`glass ${styles.hero}`} aria-label="Book site overview">
          <div className={styles.heroIntro}>
            <span className={styles.eyebrow}><Sparkles size={14} /> Reader-first workflow</span>
            <h2 className={styles.heroTitle}>Add books in seconds and browse them like a real library.</h2>
            <p className={styles.heroText}>
              Scan a spine, upload a photo, or type an ISBN. The app keeps your collection searchable, synced, and easy to return to.
            </p>
            <div className={styles.heroActions}>
              <button type="button" className={`glass ${styles.primaryAction}`} onClick={() => handleViewChange('scan')}>
                <Scan size={18} /> Start scanning
              </button>
              <button type="button" className={`glass ${styles.secondaryAction}`} onClick={() => handleViewChange('library')}>
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

        <nav className={`glass ${styles.nav}`} role="tablist" aria-label="Main navigation">
          {navItems.map(({ key, label, icon }) => (
            <button
              key={key}
              role="tab"
              onClick={() => handleViewChange(key)}
              aria-label={`${label} tab`}
              aria-selected={view === key}
              aria-current={view === key ? 'page' : undefined}
              onMouseEnter={() => {
                if (key === 'scan') void preloadScanner();
                if (key === 'library') void preloadLibrary();
                if (key === 'data') void preloadData();
                if (key === 'profile') void preloadProfile();
              }}
              onFocus={() => {
                if (key === 'scan') void preloadScanner();
                if (key === 'library') void preloadLibrary();
                if (key === 'data') void preloadData();
                if (key === 'profile') void preloadProfile();
              }}
              className={`${styles.navBtn} ${view === key ? styles.navBtnActive : ''}`}
              data-testid={uiContracts.navTabTestId(key)}
            >
              {icon} {label}
            </button>
          ))}
        </nav>
      </header>

      <main id="main-content">
        {publicPage && (
          <PublicInfoPage
            page={publicPage}
            supportEmail={SUPPORT_EMAIL}
            diagnostics={publicPage === 'support' ? diagnostics : null}
            onClose={closePublicPage}
          />
        )}

        {!publicPage && view === 'scan' && (
          <ErrorBoundary>
            <Suspense fallback={<div className={styles.lazyFallback}><div className={styles.skeletonBlock} style={{ height: '60px' }} /><div className={styles.skeletonBlock} style={{ height: '300px', marginTop: '0.75rem' }} /><div className={styles.skeletonGrid}><span /><span /><span /></div></div>}>
              <div key="scan" className={`view-enter ${styles.scanView}`}>
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
                  <button type="button" className={`glass ${styles.tipCard} ${styles.tipCardButton}`} onClick={() => handleViewChange('library')}>
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
                    if (isbn) setOpenBookIsbn(isbn);
                    handleViewChange('library');
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

        {!publicPage && view === 'library' && (
          <ErrorBoundary>
            <Suspense fallback={<div className={styles.lazyFallback}><div className={styles.skeletonBlock} style={{ height: '120px' }} /><div className={styles.skeletonBlock} style={{ height: '44px', marginTop: '0.75rem', maxWidth: '400px' }} /><div className={styles.skeletonGrid}><span style={{ height: '180px' }} /><span style={{ height: '180px' }} /><span style={{ height: '180px' }} /></div></div>}>
              <div key="library" className="view-enter">
                <LibraryList
                  onManageData={() => handleViewChange('data')}
                  onStartScanning={() => handleViewChange('scan')}
                  initialOpenIsbn={openBookIsbn}
                  onOpenComplete={() => setOpenBookIsbn(null)}
                />
              </div>
            </Suspense>
          </ErrorBoundary>
        )}

        {!publicPage && view === 'data' && (
          <ErrorBoundary>
            <Suspense fallback={<div className={styles.lazyFallback}><div className={styles.skeletonBlock} style={{ height: '48px' }} /><div className={styles.skeletonBlock} style={{ height: '200px', marginTop: '0.75rem' }} /></div>}>
              <div key="data" className="view-enter">
                <DataManagement onClose={() => handleViewChange('library')} />
              </div>
            </Suspense>
          </ErrorBoundary>
        )}

        {!publicPage && view === 'profile' && (
          <ErrorBoundary>
            <Suspense fallback={<div className={styles.lazyFallback}><div className={styles.skeletonBlock} style={{ height: '80px', borderRadius: '50%', width: '80px', margin: '0 auto' }} /><div className={styles.skeletonBlock} style={{ height: '24px', maxWidth: '200px', margin: '0.75rem auto 0' }} /><div className={styles.skeletonGrid}><span /><span /><span /><span /></div></div>}>
              <div key="profile" className="view-enter">
                <ProfileSettings inline />
              </div>
            </Suspense>
          </ErrorBoundary>
        )}
      </main>

      {showOnboarding && (
        <OnboardingModal
          currentStep={onboardingStep}
          steps={DEFAULT_ONBOARDING_STEPS.map((step) => ({
            ...step,
            onCta: step.id === 'scan'
              ? () => handleViewChange('scan')
              : step.id === 'review'
                ? () => handleViewChange('library')
                : step.id === 'views'
                  ? () => handleViewChange('library')
                  : () => handleViewChange('data'),
          }))}
          onNext={() => setOnboardingStep((step) => Math.min(step + 1, DEFAULT_ONBOARDING_STEPS.length - 1))}
          onSkip={completeOnboarding}
          onComplete={completeOnboarding}
        />
      )}

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
