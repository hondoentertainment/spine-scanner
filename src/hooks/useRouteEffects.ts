import { useEffect, useLayoutEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { legacyHashToPath } from '../app/publicPages.ts';
import { preloadData, preloadHome, preloadLibrary, preloadProfile, preloadScanView, preloadScanner } from '../app/lazyViews.ts';
import { isMvpMode } from '../lib/appMode.ts';

/** Hash-URL migration, scroll restoration, and idle route preloading. */
export function useRouteEffects() {
  const navigate = useNavigate();
  const location = useLocation();

  /** One-time migration from hash URLs (#book-…, #about) to path routes. */
  useEffect(() => {
    const path = legacyHashToPath(window.location.hash.slice(1));
    if (path) navigate(path, { replace: true });
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
      void preloadScanView();
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
}
