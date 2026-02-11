import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import AuthPanel from './components/AuthPanel.tsx';
import ThemeToggle from './components/ThemeToggle.tsx';
import { useBookLookup } from './hooks/useBookLookup.ts';
import { useBookStore } from './store/useBookStore.ts';
import { useAuthStore } from './store/useAuthStore.ts';
import { useSyncQueue } from './store/useSyncQueue.ts';
import { useOnlineStatus } from './hooks/useOnlineStatus.ts';
import { useTheme } from './hooks/useTheme.ts';
import { useToast } from './components/Toast.tsx';
import { mergeSync, pushBooks } from './lib/syncBooks.ts';
import type { BookEntry } from './types.ts';
import { BookOpen, Library, Scan, AlertCircle, Database } from 'lucide-react';
import { generateAmazonLink } from './utils/amazonLink.ts';
import { isValidIsbn } from './utils/isbnValidation.ts';
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

  // Track whether initial sync has completed to avoid marking dirty during hydration
  const initialSyncDone = useRef(false);
  const prevBooksRef = useRef(books);
  const prevShelvesRef = useRef(shelves);

  // Initialize auth on mount
  useEffect(() => {
    initAuth();
  }, [initAuth]);

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
    } finally {
      setFlushing(false);
    }
  }, [user, books, shelves, flushing, setBooks, setShelves, markSynced, setFlushing]);

  const handleSyncNow = useCallback(async () => {
    if (!user) return;
    await flushQueue();
  }, [user, flushQueue]);

  const handleScan = async (isbn: string) => {
    console.log(`[App] Received scan for ISBN: ${isbn}`);
    if (!isValidIsbn(isbn)) {
      console.log(`[App] Invalid ISBN checksum: ${isbn}`);
      toast('Invalid ISBN checksum. Please try again.', 'error');
      return;
    }

    if (books.find(b => b.isbn === isbn)) {
      console.log(`[App] ISBN ${isbn} already exists in library.`);
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
        const newBook: BookEntry = {
          id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2),
          isbn: metadata.isbn,
          title: metadata.title,
          author: metadata.authors.join(', '),
          pageCount: metadata.pageCount,
          amazonLink: generateAmazonLink(metadata.isbn),
          coverImg: metadata.thumbnail,
          status: 'to-read',
          notes: '',
          dateAdded: new Date().toISOString(),
          shelfIds: [],
        };
        addBook(newBook);
        toast(`Added "${metadata.title}" to library!`, 'success');

        if (user && online) {
          pushBooks(user.id, [...books, newBook]).catch(console.error);
        }
      } else {
        console.log(`[App] No metadata found or lookup failed for ${isbn}.`);
        toast('No metadata found for this ISBN.', 'error');
      }
    } catch (err) {
      console.error('[App] Error during scan handler:', err);
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
                <p className={styles.scanSubtitle}>Position the ISBN barcode or text within the viewfinder.</p>
              </div>

              <Scanner onScan={handleScan} isScanning={loading} />

              {error && (
                <div className={`glass ${styles.alertError}`}>
                  <AlertCircle size={20} />
                  <span>{error}</span>
                </div>
              )}
            </div>
          </Suspense>
        )}
        {view === 'library' && (
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
        )}
        {view === 'data' && (
          <Suspense
            fallback={
              <div className={styles.lazyFallback}>
                <span className={styles.lazyText}>Loading data tools...</span>
              </div>
            }
          >
            <DataManagement onClose={() => setView('library')} />
          </Suspense>
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
