import { useState, useEffect, useCallback, useRef, lazy, Suspense, useMemo } from 'react';
import type { ReactNode } from 'react';
import AuthPanel from './components/AuthPanel.tsx';
import ThemeToggle from './components/ThemeToggle.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { useBookStore } from './store/useBookStore.ts';
import { useAuthStore } from './store/useAuthStore.ts';
import { useProfileStore } from './store/useProfileStore.ts';
import { useOnlineStatus } from './hooks/useOnlineStatus.ts';
import { useTheme } from './hooks/useTheme.ts';
import { formatRelativeTime } from './utils/formatRelativeTime.ts';
import { BookOpen, Library, Scan, AlertCircle, Database, Layers, User, Sparkles, Cloud, BookMarked, ChevronRight } from 'lucide-react';
import { getLibraryInsights } from './utils/bookPresentation.ts';
import PublicInfoPage from './components/PublicInfoPage.tsx';
import OnboardingModal from './components/OnboardingModal.tsx';
import { DEFAULT_ONBOARDING_STEPS } from './components/onboardingContent.tsx';
import { setTag, setUser as setMonitoringUser, isEnabled as isMonitoringEnabled } from './lib/errorMonitoring.ts';
import { isSupabaseConfigured } from './lib/supabase.ts';
import { buildSupportDiagnostics } from './utils/supportDiagnostics.ts';
import UpdateBanner from './components/UpdateBanner.tsx';
import styles from './components/App.module.css';
import { uiContracts } from './testing/uiContracts.ts';

import { useSyncOrchestrator } from './hooks/useSyncOrchestrator.ts';
import { useAppNavigation, PUBLIC_PAGE_META, preloadScanner, preloadLibrary, preloadData, preloadProfile } from './hooks/useAppNavigation.ts';
import { useScanHandler } from './hooks/useScanHandler.ts';
import type { AppView } from './hooks/useAppNavigation.ts';

const Scanner = lazy(() => import('./components/Scanner.tsx'));
const LibraryList = lazy(() => import('./components/LibraryList.tsx'));
const DataManagement = lazy(() => import('./components/DataManagement.tsx'));
const ProfileSettings = lazy(() => import('./components/ProfileSettings.tsx'));
const PasswordReset = lazy(() => import('./components/PasswordReset.tsx'));

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined;
const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '');
const APP_RELEASE = import.meta.env.VITE_APP_RELEASE || 'dev-local';
const APP_ENV = import.meta.env.VITE_APP_ENV || import.meta.env.MODE;

function App() {
  const { books, shelves } = useBookStore();
  const { user, recoveryMode, initialize: initAuth } = useAuthStore();
  const { preferences, loadFromCloud, saveToCloud, updatePreferences } = useProfileStore();
  const { online } = useOnlineStatus();
  const { theme, toggleTheme } = useTheme();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const insights = useMemo(() => getLibraryInsights(books), [books]);

  // --- Extracted hooks ---
  const {
    online: syncOnline,
    flushing,
    pendingChanges,
    lastSyncedAt,
    lastSyncFailedAt,
    syncFailedRecently,
    handleSyncNow,
  } = useSyncOrchestrator();

  const {
    view,
    publicPage,
    openBookIsbn,
    setOpenBookIsbn,
    srAnnouncement,
    openPublicPage,
    closePublicPage,
    handleViewChange,
  } = useAppNavigation();

  const {
    handleScan,
    handlePhotoCapture,
    loading,
    error,
    batchMode,
  } = useScanHandler(setOpenBookIsbn, handleViewChange);

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

  // --- Auth & preferences initialization ---
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

  // --- Onboarding ---
  const completeOnboarding = useCallback(() => {
    setShowOnboarding(false);
    setOnboardingStep(0);
    updatePreferences({ onboardingCompleted: true });
  }, [updatePreferences]);

  useEffect(() => {
    if (publicPage) {
      setShowOnboarding(false);
      return;
    }

    if (!preferences.onboardingCompleted && books.length === 0) {
      setShowOnboarding(true);
    }
  }, [preferences.onboardingCompleted, books.length, publicPage]);

  // --- Nav items ---
  const navItems: Array<{ key: AppView; label: string; icon: ReactNode }> = [
    { key: 'scan', label: 'Add Books', icon: <Scan size={18} /> },
    { key: 'library', label: 'Library', icon: <Library size={18} /> },
    { key: 'data', label: 'Import & Export', icon: <Database size={18} /> },
    { key: 'profile', label: 'Profile', icon: <User size={18} /> },
  ];

  return (
    <div className="app-container">
      <UpdateBanner />
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
              online={syncOnline}
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

        {!publicPage && view === 'data' && (
          <ErrorBoundary>
            <Suspense fallback={<div className={styles.lazyFallback}><div className={styles.skeletonBlock} /><div className={styles.skeletonGrid}><span /><span /><span /></div></div>}>
              <DataManagement onClose={() => handleViewChange('library')} />
            </Suspense>
          </ErrorBoundary>
        )}

        {!publicPage && view === 'profile' && (
          <ErrorBoundary>
            <Suspense fallback={<div className={styles.lazyFallback}><div className={styles.skeletonBlock} /><div className={styles.skeletonGrid}><span /><span /><span /></div></div>}>
              <ProfileSettings inline />
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
