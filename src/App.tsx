import { useState, useEffect, useCallback, useRef, lazy, Suspense, useDeferredValue, useMemo } from 'react';
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

function App() {
  const [view, setView] = useState<'scan' | 'library' | 'data' | 'profile'>('scan');
  const deferredView = useDeferredValue(view);
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
  const batchMode = preferences.batchModeDefault;
  const insights = useMemo(() => getLibraryInsights(books), [books]);

  const initialSyncDone = useRef(false);
  const prevBooksRef = useRef(books);
  const prevShelvesRef = useRef(shelves);
  const batchBooksAddedRef = useRef(0);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

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

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!user?.id) return;
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveToCloud(user.id), 800);
    return () => { clearTimeout(saveTimeoutRef.current); };
  }, [user?.id, preferences, saveToCloud]);

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
      const merged = await mergeSync(user.id, books, shelves);
      if (merged) {
        setBooks(merged.books);
        setShelves(merged.shelves);
        markSynced();
        prevBooksRef.current = merged.books;
        prevShelvesRef.current = merged.shelves;
        return true;
      }
    } catch (err) {
      console.error('[sync] Flush failed:', err);
      markSyncFailed();
      toast('Sync failed. Will retry when online.', 'error');
    } finally {
      setFlushing(false);
    }
    return false;
  }, [user, flushing, books, shelves, setBooks, setShelves, markSynced, markSyncFailed, setFlushing, toast]);

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
      metadataSource: 'manual' as const,
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
        metadataSource: 'manual' as const,
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
            metadataSource: 'manual' as const,
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

  const handleViewChange = useCallback((newView: 'scan' | 'library' | 'data' | 'profile') => {
    const labels: Record<string, string> = {
      scan: 'Scanner view',
      library: 'Library view',
      data: 'Import and export view',
      profile: 'Profile view',
    };
    setView(newView);
    setSrAnnouncement(labels[newView]);
  }, []);

  const navItems: Array<{ key: 'scan' | 'library' | 'data' | 'profile'; label: string; icon: ReactNode }> = [
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
        {deferredView === 'scan' && (
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

        {deferredView === 'library' && (
          <ErrorBoundary>
            <Suspense fallback={<div className={styles.lazyFallback}><div className={styles.skeletonBlock} /><div className={styles.skeletonGrid}><span /><span /><span /></div></div>}>
              <LibraryList
                onManageData={() => handleViewChange('data')}
                onStartScanning={() => handleViewChange('scan')}
                initialOpenIsbn={openBookIsbn}
                onOpenComplete={() => setOpenBookIsbn(null)}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {deferredView === 'data' && (
          <ErrorBoundary>
            <Suspense fallback={<div className={styles.lazyFallback}><div className={styles.skeletonBlock} /><div className={styles.skeletonGrid}><span /><span /><span /></div></div>}>
              <DataManagement onClose={() => handleViewChange('library')} />
            </Suspense>
          </ErrorBoundary>
        )}

        {deferredView === 'profile' && (
          <ErrorBoundary>
            <Suspense fallback={<div className={styles.lazyFallback}><div className={styles.skeletonBlock} /><div className={styles.skeletonGrid}><span /><span /><span /></div></div>}>
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
        @media (prefers-reduced-motion: reduce) {
          .app-container { opacity: 1; animation: none !important; }
          .animate-spin { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

export default App;
