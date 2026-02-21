import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import AuthPanel from './components/AuthPanel.tsx';
import ThemeToggle from './components/ThemeToggle.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { useBookLookup } from './hooks/useBookLookup.ts';
import { useBookStore } from './store/useBookStore.ts';
import { useAuthStore } from './store/useAuthStore.ts';
import { useSyncQueue } from './store/useSyncQueue.ts';
import { useOnlineStatus } from './hooks/useOnlineStatus.ts';
import { useTheme } from './hooks/useTheme.ts';
import { useToast } from './components/Toast.tsx';
import { mergeSync, pushBooks } from './lib/syncBooks.ts';
import type { BookEntry } from './types.ts';
import { BookOpen, Library, Scan, AlertCircle, Database, Layers } from 'lucide-react';
import { generateAmazonLink } from './utils/amazonLink.ts';
import { isValidIsbn, normalizeToIsbn13 } from './utils/isbnValidation.ts';
import { isbnExistsInLibrary } from './utils/libraryUtils.ts';
import styles from './components/App.module.css';

const Scanner = lazy(() => import('./components/Scanner.tsx'));
const LibraryList = lazy(() => import('./components/LibraryList.tsx'));
const DataManagement = lazy(() => import('./components/DataManagement.tsx'));
const preloadScanner = () => import('./components/Scanner.tsx');
const preloadLibrary = () => import('./components/LibraryList.tsx');
const preloadData = () => import('./components/DataManagement.tsx');

function App() {
  const [view, setView] = useState<'scan' | 'library' | 'data'>('scan');
  const { lookupByIsbn, loading, error } = useBookLookup();
  const { addBook, books, setBooks, shelves, setShelves } = useBookStore();
  const { user, initialize: initAuth } = useAuthStore();
  const { pendingChanges, markDirty, markSynced, flushing, setFlushing } = useSyncQueue();
  const { online, justReconnected, clearReconnected } = useOnlineStatus();
  const { theme, toggleTheme } = useTheme();
  const { toast, confirm } = useToast();
  const [openBookIsbn, setOpenBookIsbn] = useState<string | null>(null);
  const [batchMode, setBatchMode] = useState(false);

  // Track whether initial sync has completed to avoid marking dirty during hydration
  const initialSyncDone = useRef(false);
  const prevBooksRef = useRef(books);
  const prevShelvesRef = useRef(shelves);
  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize auth on mount
  useEffect(() => {
    initAuth();
  }, [initAuth]);

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
  }, [user, books, shelves, flushing, setBooks, setShelves, markSynced, setFlushing]);

  const handleSyncNow = useCallback(async () => {
    if (!user) return;
    if (autoSyncTimerRef.current) {
      clearTimeout(autoSyncTimerRef.current);
      autoSyncTimerRef.current = null;
    }
    await flushQueue();
  }, [user, flushQueue]);

  // Auto-sync: flush 30 s after the last local mutation (debounced)
  useEffect(() => {
    if (!user || !online || flushing || pendingChanges === 0) return;
    if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
    autoSyncTimerRef.current = setTimeout(flushQueue, 30_000);
    return () => {
      if (autoSyncTimerRef.current) {
        clearTimeout(autoSyncTimerRef.current);
        autoSyncTimerRef.current = null;
      }
    };
  // flushQueue captures the latest books/shelves so the flush always has current data
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingChanges, user, online, flushing, flushQueue]);

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
    // updatedAt is stamped by useBookStore.addBook
    addBook(newBook);
    toast('Book added with photo. Edit details in your library.', 'success');
    if (user && online) {
      pushBooks(user.id, [...books, newBook]).catch(() => toast('Cloud sync failed. Changes saved locally.', 'warning'));
    }
    setOpenBookIsbn(photoIsbn);
    setView('library');
  }, [addBook, books, user, online, toast]);

  const handleScan = async (isbn: string) => {
    console.log(`[App] Received scan for ISBN: ${isbn}`);
    if (!isValidIsbn(isbn)) {
      console.log(`[App] Invalid ISBN checksum: ${isbn}`);
      toast('Invalid ISBN checksum. Please try again.', 'error');
      return;
    }

    if (isbnExistsInLibrary(isbn, books)) {
      console.log(`[App] ISBN ${isbn} already exists in library.`);
      if (batchMode) {
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
        setOpenBookIsbn(isbn);
        setView('library');
      }
      return;
    }

    console.log(`[App] Looking up metadata for ${isbn}...`);
    try {
      const metadata = await lookupByIsbn(isbn);
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
        addBook(newBook);
        toast(batchMode ? `Added "${metadata.title}" — scan next` : `Added "${metadata.title}" to library!`, 'success');

        if (!batchMode) {
          setOpenBookIsbn(storedIsbn);
          setView('library');
        }
        if (user && online) {
          pushBooks(user.id, [...books, newBook]).catch(() => toast('Cloud sync failed. Changes saved locally.', 'warning'));
        }
      } else {
        console.log(`[App] No metadata found or lookup failed for ${isbn}.`);
        const addAnyway = await confirm({
          title: 'No metadata found',
          message: `Google Books and Open Library couldn't find details for ISBN ${isbn}. Add it anyway? You can edit the title and author manually in your library.`,
          confirmLabel: 'Add anyway',
          cancelLabel: 'Cancel',
        });
        if (addAnyway) {
          const storedIsbn = normalizeToIsbn13(isbn);
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
          addBook(newBook);
          toast(batchMode ? 'Added — scan next' : 'Added with ISBN only. Edit details in your library.', 'success');
          if (!batchMode) {
            setOpenBookIsbn(storedIsbn);
            setView('library');
          }
          if (user && online) {
            pushBooks(user.id, [...books, newBook]).catch(() => toast('Cloud sync failed. Changes saved locally.', 'warning'));
          }
        } else {
          toast('No metadata found for this ISBN.', 'error');
        }
      }
    } catch (err) {
      console.error('[App] Error during scan handler:', err);
      toast('Something went wrong during book lookup. Please try again.', 'error');
    }
  };

  return (
    <div className="app-container">
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
          />
        </div>

        <nav className={`glass ${styles.nav}`}>
          {([
            ['scan', 'Scanner', <Scan key="s" size={18} />],
            ['library', 'Library', <Library key="l" size={18} />],
            ['data', 'Data', <Database key="d" size={18} />],
          ] as [string, string, React.ReactNode][]).map(([key, label, icon]) => (
            <button
              key={key}
              onClick={() => setView(key as 'scan' | 'library' | 'data')}
              aria-label={`${label} tab`}
              aria-current={view === key ? 'page' : undefined}
              onMouseEnter={() => {
                if (key === 'scan') void preloadScanner();
                if (key === 'library') void preloadLibrary();
                if (key === 'data') void preloadData();
              }}
              onFocus={() => {
                if (key === 'scan') void preloadScanner();
                if (key === 'library') void preloadLibrary();
                if (key === 'data') void preloadData();
              }}
              className={`${styles.navBtn} ${view === key ? styles.navBtnActive : ''}`}
            >
              {icon} {label}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {view === 'scan' && (
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
                    onClick={() => setBatchMode(b => !b)}
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
        {view === 'library' && (
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
        {view === 'data' && (
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
      </main>

      <style>{`
        .app-container { opacity: 0; animation: fadeIn 0.8s ease-out forwards; }
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

export default App;
