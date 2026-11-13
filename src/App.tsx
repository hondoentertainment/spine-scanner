import { Suspense, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import CloudMergePrompt from './components/CloudMergePrompt.tsx';
import OnboardingModal from './components/OnboardingModal.tsx';
import { DEFAULT_ONBOARDING_STEPS } from './components/onboardingContent.tsx';
import PwaInstallPrompt from './components/PwaInstallPrompt.tsx';
import AppHeader from './app/AppHeader.tsx';
import AppRoutes from './app/AppRoutes.tsx';
import LegalFooter from './app/LegalFooter.tsx';
import { useDocumentHead } from './app/documentHead.ts';
import { PasswordReset } from './app/lazyViews.ts';
import { getBrandingSubtitle, getPublicPageFromPath } from './app/publicPages.ts';
import { useAppNavigation } from './hooks/useAppNavigation.ts';
import { useAuthSession } from './hooks/useAuthSession.ts';
import { useLibrarySync } from './hooks/useLibrarySync.ts';
import { useOnboarding } from './hooks/useOnboarding.ts';
import { useRouteEffects } from './hooks/useRouteEffects.ts';
import { useScanCapture } from './hooks/useScanCapture.ts';
import { useSupportDiagnostics } from './hooks/useSupportDiagnostics.ts';
import { useAuthStore } from './store/useAuthStore.ts';
import styles from './components/App.module.css';

function App() {
  const location = useLocation();
  const publicPage = getPublicPageFromPath(location.pathname);
  const showLegalFooter = publicPage != null || location.pathname === '/profile';
  const brandingSubtitle = getBrandingSubtitle(location.pathname, publicPage);
  const mainRef = useRef<HTMLElement>(null);

  useAuthSession();
  useRouteEffects();
  const sync = useLibrarySync();
  const scan = useScanCapture(sync.online);
  const onboarding = useOnboarding(publicPage);
  const diagnostics = useSupportDiagnostics(sync.online, location.pathname, publicPage);
  const nav = useAppNavigation();
  useDocumentHead(location.pathname, location.search, publicPage);
  const { recoveryMode } = useAuthStore();

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
        {nav.srAnnouncement}
      </div>

      <AppHeader
        pathname={location.pathname}
        brandingSubtitle={brandingSubtitle}
        online={sync.online}
        pendingChanges={sync.pendingChanges}
        flushing={sync.flushing}
        lastSyncedAt={sync.lastSyncedAt}
        syncFailedRecently={sync.syncFailedRecently}
        onSyncNow={() => { void sync.handleSyncNow(); }}
        onOpenProfile={() => nav.goToMain('/profile', 'Profile view')}
        onAnnounce={nav.setSrAnnouncement}
      />

      <main
        ref={mainRef}
        id="main-content"
        className={`${styles.mainContent} ${showLegalFooter ? '' : styles.mainClearsTabBar}`.trim()}
        tabIndex={-1}
      >
        <PwaInstallPrompt />
        <AppRoutes
          diagnostics={diagnostics}
          onClosePublic={nav.closePublicPage}
          online={sync.online}
          isbnFormRef={scan.isbnFormRef}
          loading={scan.loading}
          scanError={scan.error}
          isbnEntryActive={scan.isbnEntryActive}
          onIsbnActiveChange={scan.setIsbnEntryActive}
          recentAdd={scan.recentAdd}
          onDismissRecentAdd={() => scan.setRecentAdd(null)}
          onScan={scan.handleScan}
          onPhotoCapture={scan.handlePhotoCapture}
          onShelfImport={scan.handleShelfImport}
          goToMain={nav.goToMain}
          openPublicPage={nav.openPublicPage}
        />
      </main>

      <OnboardingModal
        open={onboarding.showOnboarding}
        steps={DEFAULT_ONBOARDING_STEPS.map((step) => ({
          ...step,
          onCta: step.id === 'scan'
            ? () => nav.goToMain('/scan', 'Scanner view')
            : step.id === 'organize'
              ? () => nav.goToMain('/library', 'Library view')
              : step.onCta,
        }))}
        onClose={onboarding.completeOnboarding}
      />

      {showLegalFooter && <LegalFooter onOpen={nav.openPublicPage} />}

      {sync.mergeOffer && (
        <CloudMergePrompt
          bookCount={sync.mergeOffer.count}
          busy={sync.flushing}
          error={sync.mergeError}
          onMerge={() => void sync.acceptCloudMerge()}
          onLater={sync.declineCloudMerge}
        />
      )}

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
