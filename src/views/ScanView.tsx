import { lazy, Suspense, useEffect, useMemo } from 'react';
import type { RefObject } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, BookMarked, ChevronRight, Cloud, Layers, Library, Scan, Sparkles } from 'lucide-react';
import type { ManualIsbnFormHandle } from '../components/ManualIsbnForm.tsx';
import ManualIsbnForm from '../components/ManualIsbnForm.tsx';
import RouteFallback from '../app/RouteFallback.tsx';
import type { MainPath } from '../app/publicPages.ts';
import type { PublicPage } from '../components/PublicInfoPage.tsx';
import { isMvpMode } from '../lib/appMode.ts';
import type { ShelfReviewItem } from '../shelf/types.ts';
import { useAuthStore } from '../store/useAuthStore.ts';
import { useBookStore } from '../store/useBookStore.ts';
import { useProfileStore } from '../store/useProfileStore.ts';
import { useSyncQueue } from '../store/useSyncQueue.ts';
import { getLibraryInsights } from '../utils/bookPresentation.ts';
import { formatRelativeTime } from '../utils/formatRelativeTime.ts';
import type { ScanRequestOptions } from '../hooks/useScanCapture.ts';
import styles from '../components/App.module.css';

const Scanner = lazy(() => import('../components/Scanner.tsx'));

type ScanViewProps = {
  online: boolean;
  isbnFormRef: RefObject<ManualIsbnFormHandle | null>;
  loading: boolean;
  error: string | null;
  isbnEntryActive: boolean;
  onIsbnActiveChange: (active: boolean) => void;
  recentAdd: { title: string; isbn: string } | null;
  onDismissRecentAdd: () => void;
  onScan: (isbn: string, options?: ScanRequestOptions) => Promise<void> | void;
  onPhotoCapture: (imageDataUrl: string) => void;
  onShelfImport: (items: ShelfReviewItem[]) => boolean;
  goToMain: (path: MainPath, announcement: string) => void;
  openPublicPage: (page: PublicPage) => void;
};

export default function ScanView({
  online,
  isbnFormRef,
  loading,
  error,
  isbnEntryActive,
  onIsbnActiveChange,
  recentAdd,
  onDismissRecentAdd,
  onScan,
  onPhotoCapture,
  onShelfImport,
  goToMain,
  openPublicPage,
}: ScanViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { books } = useBookStore();
  const { user } = useAuthStore();
  const { preferences, updatePreferences } = useProfileStore();
  const pendingChanges = useSyncQueue((s) => s.pendingChanges);
  const lastSyncedAt = useSyncQueue((s) => s.lastSyncedAt);
  const insights = useMemo(() => getLibraryInsights(books), [books]);
  const batchMode = preferences.batchModeDefault;
  const showScanGuide = location.pathname === '/scan' && !isMvpMode() && books.length === 0;

  useEffect(() => {
    if (location.pathname !== '/scan') return;
    const params = new URLSearchParams(location.search);
    if (params.get('focus') !== 'isbn') return;
    isbnFormRef.current?.focus();
    params.delete('focus');
    const search = params.toString();
    navigate({ pathname: '/scan', search: search ? `?${search}` : '' }, { replace: true });
  }, [isbnFormRef, location.pathname, location.search, navigate]);

  return (
      <div className={styles.scanView}>
        <div className={styles.scanCapture}>
          <ManualIsbnForm
            ref={isbnFormRef}
            disabled={loading}
            onActiveChange={onIsbnActiveChange}
            onSubmit={(isbn, options) => { void onScan(isbn, options); }}
          />
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

        {recentAdd && (
          <div className={styles.scanAnother} role="status" aria-live="polite">
            <div>
              <strong>Added {recentAdd.title}</strong>
              <p>Ready for the next book.</p>
            </div>
            <div className={styles.scanAnotherActions}>
              <button type="button" className={styles.primaryAction} onClick={onDismissRecentAdd}>
                Scan another
              </button>
              <button
                type="button"
                className={`glass ${styles.secondaryAction}`}
                onClick={() => navigate(`/library?isbn=${encodeURIComponent(recentAdd.isbn)}`)}
              >
                View
              </button>
            </div>
          </div>
        )}

        <Suspense fallback={<RouteFallback />}>
          <Scanner
            onScan={onScan}
            onPhotoCapture={onPhotoCapture}
            isScanning={loading}
            batchMode={batchMode}
            liveScanPaused={isbnEntryActive}
            onNeedManualIsbn={() => isbnFormRef.current?.focus()}
            onEditIsbn={(isbn) => isbnFormRef.current?.setValue(isbn)}
            onOpenSupport={() => openPublicPage('support')}
            onOpenPrivacy={() => openPublicPage('privacy')}
            onViewLibrary={(isbn) => {
              navigate(isbn ? `/library?isbn=${encodeURIComponent(isbn)}` : '/library');
            }}
            onShelfImport={onShelfImport}
          />
        </Suspense>

        {error && (
          <div className={`glass ${styles.alertError}`}>
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        <div className={styles.scanBelow}>
          {showScanGuide && (
            <>
              <section className={`glass ${styles.hero}`} aria-label="Book site overview">
                <div className={styles.heroIntro}>
                  <span className={styles.eyebrow}><Sparkles size={14} /> Reader-first workflow</span>
                  <h2 className={styles.heroTitle}>Add books in seconds and browse them like a real library.</h2>
                  <p className={styles.heroText}>
                    Scan a spine, upload a photo, or type an ISBN. The app keeps your collection searchable, synced, and easy to return to.
                  </p>
                  <div className={styles.heroActions}>
                    <button type="button" className={`glass ${styles.primaryAction}`} onClick={() => isbnFormRef.current?.focus()}>
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
                    <span className={styles.statLabel}>{user ? 'Sync status' : 'Library'}</span>
                    <strong>{user ? (online ? 'Online' : 'Offline') : 'On this device'}</strong>
                    <span>
                      {user
                        ? pendingChanges > 0
                          ? `${pendingChanges} change${pendingChanges === 1 ? '' : 's'} to sync`
                          : lastSyncedAt
                            ? `Synced ${formatRelativeTime(lastSyncedAt)}`
                            : 'Everything is up to date.'
                        : 'Saved on this device'}
                    </span>
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

          {showScanGuide && (
            <section className={styles.scanExplainer} aria-label="Ways to add a book">
              <h2 className={styles.scanTitle}>Three easy ways to capture a book</h2>
              <p className={styles.scanSubtitle}>Point at a barcode, a spine, or a whole shelf. Then confirm the book.</p>
              <div className={styles.scanTips}>
                <div className={`glass ${styles.tipCard}`}>
                  <strong>Barcode</strong>
                  <span>Point at the bars on the back. We look up the book and add it.</span>
                </div>
                <div className={`glass ${styles.tipCard}`}>
                  <strong>Spine</strong>
                  <span>Point at the title and hold still. We read it, then you confirm.</span>
                </div>
                <div className={`glass ${styles.tipCard}`}>
                  <strong>Shelf</strong>
                  <span>Point at a row of books. Then keep, edit, or skip each one.</span>
                </div>
                <button type="button" className={`glass ${styles.tipCard} ${styles.tipCardButton}`} onClick={() => goToMain('/library', 'Library view')}>
                  <strong>Already scanned enough?</strong>
                  <span>Jump to your library <ChevronRight size={14} /></span>
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
  );
}
