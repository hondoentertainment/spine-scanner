import { Suspense } from 'react';
import type { RefObject } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from '../components/ErrorBoundary.tsx';
import PublicInfoPage from '../components/PublicInfoPage.tsx';
import type { PublicPage } from '../components/PublicInfoPage.tsx';
import type { ManualIsbnFormHandle } from '../components/ManualIsbnForm.tsx';
import type { ScanRequestOptions } from '../hooks/useScanCapture.ts';
import { isMvpMode } from '../lib/appMode.ts';
import type { ShelfReviewItem } from '../shelf/types.ts';
import type { SupportDiagnosticsSnapshot } from '../utils/supportDiagnostics.ts';
import LibraryRoute from '../views/LibraryRoute.tsx';
import RouteFallback from './RouteFallback.tsx';
import { DataManagement, HomeFeed, ProfileSettings, RecommendationsView, ScanView } from './lazyViews.ts';
import { SUPPORT_EMAIL, type MainPath } from './publicPages.ts';

type AppRoutesProps = {
  diagnostics: SupportDiagnosticsSnapshot;
  onClosePublic: () => void;
  online: boolean;
  isbnFormRef: RefObject<ManualIsbnFormHandle | null>;
  loading: boolean;
  scanError: string | null;
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

export default function AppRoutes({
  diagnostics,
  onClosePublic,
  online,
  isbnFormRef,
  loading,
  scanError,
  isbnEntryActive,
  onIsbnActiveChange,
  recentAdd,
  onDismissRecentAdd,
  onScan,
  onPhotoCapture,
  onShelfImport,
  goToMain,
  openPublicPage,
}: AppRoutesProps) {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={isMvpMode() ? '/scan' : '/home'} replace />} />
      <Route
        path="/about"
        element={(
          <PublicInfoPage
            page="about"
            supportEmail={SUPPORT_EMAIL}
            diagnostics={null}
            onClose={onClosePublic}
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
            onClose={onClosePublic}
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
            onClose={onClosePublic}
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
            onClose={onClosePublic}
          />
        )}
      />
      <Route
        path="/home"
        element={(
          <ErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
              <HomeFeed />
            </Suspense>
          </ErrorBoundary>
        )}
      />
      <Route
        path="/scan"
        element={(
          <ErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
            <ScanView
              online={online}
              isbnFormRef={isbnFormRef}
              loading={loading}
              error={scanError}
              isbnEntryActive={isbnEntryActive}
              onIsbnActiveChange={onIsbnActiveChange}
              recentAdd={recentAdd}
              onDismissRecentAdd={onDismissRecentAdd}
              onScan={onScan}
              onPhotoCapture={onPhotoCapture}
              onShelfImport={onShelfImport}
              goToMain={goToMain}
              openPublicPage={openPublicPage}
            />
            </Suspense>
          </ErrorBoundary>
        )}
      />
      <Route
        path="/recommendations"
        element={(
          <ErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
              <RecommendationsView />
            </Suspense>
          </ErrorBoundary>
        )}
      />
      <Route
        path="/library"
        element={(
          <ErrorBoundary>
            <LibraryRoute onStartScanning={() => goToMain('/scan', 'Scanner view')} />
          </ErrorBoundary>
        )}
      />
      <Route
        path="/data"
        element={(
          <ErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
              <DataManagement onClose={() => goToMain('/profile', 'Profile view')} />
            </Suspense>
          </ErrorBoundary>
        )}
      />
      <Route
        path="/profile"
        element={(
          <ErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
              <ProfileSettings inline />
            </Suspense>
          </ErrorBoundary>
        )}
      />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
