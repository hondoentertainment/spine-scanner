import { useState, useEffect, useCallback, useRef, lazy, Suspense, useDeferredValue } from 'react';
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
import type { BookEntry } from './types.ts';
import { BookOpen, Library, Scan, AlertCircle, Database, Layers, User } from 'lucide-react';
import { generateAmazonLink } from './utils/amazonLink.ts';
import { isValidIsbn, normalizeToIsbn13 } from './utils/isbnValidation.ts';
import { isbnExistsInLibrary } from './utils/libraryUtils.ts';
import { useAnalyticsStore } from './store/useAnalyticsStore.ts';
import styles from './components/App.module.css';

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

function App() {
  const [view, setView] = useState<'scan' | 'library' | 'data' | 'profile'>('scan');
  const deferredView = useDeferredValue(view);
  const { lookupByIsbn, loading, error } = useBookLookup();
  const { addBook, books, setBooks, shelves, setShelves } = useBookStore();
  const { user, recoveryMode, initialize: initAuth } = useAuthStore();
  const { preferences, loadFromCloud, saveToCloud, updatePreferences } = useProfileStore();
  const { pendingChanges, markDirty, markSynced, flushing, setFlushing } = useSyncQueue();
  const { online, justReconnected, clearReconnected } = useOnlineStatus();
  const { theme, toggleTheme } = useTheme();
  const { toast, confirm } = useToast();
  const { track } = useAnalyticsStore();
  const [openBookIsbn, setOpenBookIsbn] = useState<string | null>(null);
  const batchMode = preferences.batchModeDefault;

  // Track whether initial sync has completed to avoid marking dirty during hydration
  const initialSyncDone = useRef(false);
  const prevBooksRef = useRef(books);
  const prevShelvesRef = useRef(shelves);

  // Initialize auth on mount
  useEffect(() => {
    initAuth();
  }, [initAuth]);

  // One-time migration: move theme from legacy localStorage key into profile preferences
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load profile preferences from cloud when user signs in
  useEffect(() => {
    if (user?.id) {
      loadFromCloud(user.id);
    }
  }, [user?.id, loadFromCloud]);

  // Sync preferences to cloud when they change (debounced)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!user?.id) return;
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveToCloud(user.id), 800);
    return () => { clearTimeout(saveTimeoutRef.current); };
  }, [user?.id, preferences, saveToCloud]);

  // Handle deep links (#book-ISBN or #book-photo-id)
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const m = hash.match(/^book-(.+)$/);
    if (m) {
      const isbn = decodeURIComponent(m[1]);
      if (isbn) {
        setView('library');
        setOpenBookIsbn(isbn);
      }
    }
  }, []);

  // Eager preload all nav views after mount to reduce INP when switching tabs
  useEffect(() => {
    const preloadAll = () => {
      void preloadScanner();
      void preloadLibrary();
      void preloadData();
      void preloadProfile();
    };
    const id = typeof requestIdleCallback !== 'undefined'
      ? requestIdleCallback(preloadAll, { timeout: 150 })
      : 0;
    const t = setTimeout(preloadAll, 150);
    return () => {
      if (typeof cancelIdleCallback !== 'undefined' && id) cancelIdleCallback(id);
      clearTimeout(t);
    };
  }, []);

  // Auto-sync: pull from cloud on sign-in
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

    doInitialSync();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Detect local mutations and mark queue dirty
  useEffect(() => {
    if (!user || !initialSyncDone.current) return;
    if (books !== prevBooksRef.current || shelves !== prevShelvesRef.current) {
      const booksChanged = books !== prevBooksRef.current;
      const shelvesChanged = shelves !== prevShelvesRef.current;
      if (booksChanged || shelvesChanged) {
        markDirty();
      }
    }
    prevBooksRef.current = books;
    prevShelvesRef.current = shelves;
  }, [books, shelves, user, markDirty]);

  // Auto-flush when coming back online
  useEffect(() => {
    if (justReconnected && user && pendingChanges > 0 && !flushing) {
      clearReconnected();
      flushQueue();
    } else if (justReconnected) {
      clearReconnected();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justReconnected]);

  const flushQueue = useCallback(async () => {
    if (!user || flushing) return;
    setFlushing(true);
    try {
      const merged = await mergeSync(user.id, books, shelves);
      if (merged) {
        setBooks(merged.books);
        setShelves(merged.shelves);
        markSynced();
        prevBooksRef.current = merged.books;
        prevShelvesRef.current = merged.shelves;
      }
    } catch (err) {
      console.error('[sync] Flush failed:', err);
      toast('Sync failed. Will retry when online.', 'error');
    } finally {
      setFlushing(false);
    }
  }, [user, books, shelves, flushing, setBooks, setShelves, markSynced, setFlushing, toast]);

  const handleSyncNow = useCallback(async () => {
    if (!user) return;
    await flushQueue();
  }, [user, flushQueue]);

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
    };
    addBook(newBook);
    track('book_added', { method: 'photo' });
    toast('Book added with photo. Edit details in your library.', 'success');
    if (user && online) {
      pushBooks(user.id, [...books, newBook]).catch(() => toast('Cloud sync failed. Changes saved locally.', 'warning'));
    }
    setOpenBookIsbn(photoIsbn);
    setView('library');
  }, [addBook, books, user, online, toast, track]);

  const addBookAndOpen = useCallback((newBook: BookEntry, successMessage: string, trackMethod: string, forceOpen = false) => {
    addBook(newBook);
    track('book_added', { method: trackMethod, isbn: newBook.isbn });
    toast(batchMode && !forceOpen ? 'Added - scan next' : successMessage, 'success');

    if (!batchMode || forceOpen) {
      setOpenBookIsbn(newBook.isbn);
      setView('library');
    }

    if (user && online) {
      pushBooks(user.id, [...books, newBook]).catch(() => toast('Cloud sync failed. Changes saved locally.', 'warning'));
    }
  }, [addBook, batchMode, books, online, toast, track, user]);

  const handleScan = async (isbn: string, options: ScanRequestOptions = {}) => {
    const normalizedInput = isbn.replace(/[^0-9Xx]/g, '').replace(/x$/i, 'X') || isbn;
    const isChecksumValid = isValidIsbn(normalizedInput);
    const canReviewInvalid = options.allowReview === true && !isChecksumValid;

    console.log(`[App] Received scan for ISBN: ${isbn}`);

    if (isbnExistsInLibrary(normalizedInput, books)) {
      console.log(`[App] ISBN ${normalizedInput} already exists in library.`);
      if (batchMode && options.source !== 'manual') {
        toast('Already in library. Scan next.', 'info');
        return;
      }
      const openInLibrary = await confirm({
        title: 'Book already in library',
        message: 'You already have this in your library. Update notes instead?',
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
        console.log(`[App] Invalid ISBN checksum: ${normalizedInput}`);
        toast('Invalid ISBN checksum. Please try again.', 'error');
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
        notes: 'Added from manual ISBN entry. Verify or correct the ISBN and fill in the missing details.',
        dateAdded: new Date().toISOString(),
        shelfIds: [],
      };

      addBookAndOpen(reviewBook, 'Added for review. Open the book to verify the ISBN and details.', 'manual_review', true);
      return;
    }

    console.log(`[App] Looking up metadata for ${normalizedInput}...`);
    try {
      const metadata = await lookupByIsbn(normalizedInput);
      if (metadata) {
        console.log(`[App] Metadata found: ${metadata.title}`);
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
        addBookAndOpen(newBook, `Added "${metadata.title}" to library!`, options.source === 'manual' ? 'manual' : 'scan', options.source === 'manual');
      } else {
        console.log(`[App] No metadata found or lookup failed for ${normalizedInput}.`);
        const addAnyway = await confirm({
          title: 'No metadata found',
          message: `Google Books and Open Library couldn't find details for ISBN ${normalizedInput}. Add it anyway? You can edit the title and author manually in your library.`,
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
          };
          addBookAndOpen(newBook, 'Added with ISBN only. Edit details in your library.', options.source === 'manual' ? 'manual_no_metadata' : 'scan_no_metadata', options.source === 'manual');
        } else {
          toast('No metadata found for this ISBN.', 'error');
        }
      }
    } catch (err) {
      console.error('[App] Error during scan handler:', err);
      toast('Something went wrong during book lookup. Please try again.', 'error');
    }
  };

  // Screen reader announcement for view changes
  const [srAnnouncement, setSrAnnouncement] = useState('');
  const handleViewChange = useCallback((newView: 'scan' | 'library' | 'data' | 'profile') => {
    const labels: Record<string, string> = {
      scan: 'Scanner view',
      library: 'Library view',
      data: 'Data management view',
      profile: 'Profile view',
    };
    setView(newView);
    setSrAnnouncement(labels[newView]);
  }, []);

  return (
    <div className="app-container">
      <a href="#main-content" className={styles.skipLink}>Skip to main content</a>

      {/* Screen reader live region for view changes */}
      <div className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
        {srAnnouncement}
      </div>

      <header className={styles.header}>
        <div className={styles.branding}>
          <div className={styles.logoBox}>
            <BookOpen size={28} color="white" />
          </div>
          <div>
            <h1 className={styles.appTitle}>
              Spine<span className={styles.titleAccent}>Scanner</span>
            </h1>
            <p className={styles.subtitle}>Digital Library & OCR Explorer</p>
          </div>
        </div>

        <div className={styles.headerRight}>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <AuthPanel
            onSyncNow={handleSyncNow}
            syncing={flushing}
            lastSynced={useSyncQueue.getState().lastSyncedAt}
            online={online}
            pendingChanges={pendingChanges}
            onOpenProfile={() => handleViewChange('profile')}
          />
        </div>

        <nav className={`glass ${styles.nav}`} role="tablist" aria-label="Main navigation">
          {([
            ['scan', 'Scanner', <Scan key="s" size={18} />],
            ['library', 'Library', <Library key="l" size={18} />],
            ['data', 'Data', <Database key="d" size={18} />],
            ['profile', 'Profile', <User key="p" size={18} />],
          ] as [string, string, React.ReactNode][]).map(([key, label, icon]) => (
            <button
              key={key}
              role="tab"
              onClick={() => handleViewChange(key as 'scan' | 'library' | 'data' | 'profile')}
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
            >
              {icon} {label}
            </button>
          ))}
        </nav>
      </header>

      <main id="main-content">
        {deferredView === 'scan' && (
          <ErrorBoundary>
            <Suspense
              fallback={
                <div className={styles.lazyFallback}>
                  <span className={styles.lazyText}>Loading scanner...</span>
                </div>
              }
            >
              <div className={styles.scanView}>
                <div className={styles.scanHeader}>
                  <h2 className={styles.scanTitle}>Scan Book Spine</h2>
                  <p className={styles.scanSubtitle}>Scan ISBN, capture a book photo, or enter manually.</p>
                  <button
                    type="button"
                    onClick={() => updatePreferences({ batchModeDefault: !batchMode })}
                    className={`glass ${styles.batchToggle} ${batchMode ? styles.batchToggleActive : ''}`}
                    aria-pressed={batchMode}
                    title={batchMode ? 'Exit batch mode' : 'Batch add: stay on scanner after each add'}
                  >
                    <Layers size={18} />
                    {batchMode ? 'Batch mode on' : 'Batch add'}
                  </button>
                </div>

                <Scanner onScan={handleScan} onPhotoCapture={handlePhotoCapture} isScanning={loading} batchMode={batchMode} />

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
        {deferredView === 'library' && (
          <ErrorBoundary>
            <Suspense
              fallback={
                <div className={styles.lazyFallback}>
                  <span className={styles.lazyText}>Loading library...</span>
                </div>
              }
            >
              <LibraryList
                onManageData={() => setView('data')}
                initialOpenIsbn={openBookIsbn}
                onOpenComplete={() => setOpenBookIsbn(null)}
              />
            </Suspense>
          </ErrorBoundary>
        )}
        {deferredView === 'data' && (
          <ErrorBoundary>
            <Suspense
              fallback={
                <div className={styles.lazyFallback}>
                  <span className={styles.lazyText}>Loading data tools...</span>
                </div>
              }
            >
              <DataManagement onClose={() => setView('library')} />
            </Suspense>
          </ErrorBoundary>
        )}
        {deferredView === 'profile' && (
          <ErrorBoundary>
            <Suspense
              fallback={
                <div className={styles.lazyFallback}>
                  <span className={styles.lazyText}>Loading profile...</span>
                </div>
              }
            >
              <ProfileSettings inline />
            </Suspense>
          </ErrorBoundary>
        )}
      </main>

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
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) {
          .app-container { opacity: 1; animation: none !important; }
          .animate-spin { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

export default App;
