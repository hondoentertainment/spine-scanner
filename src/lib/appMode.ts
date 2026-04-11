/**
 * MVP vs full UI is selected at **build time** via `import.meta.env.VITE_APP_MODE` (inlined by Vite).
 * Use `npm run build:mvp` (sets `VITE_APP_MODE=mvp`) or set `VITE_APP_MODE` in your build environment.
 *
 * {@link appModeMatrix} summarizes what `isMvpMode()` toggles across the app; see `App.tsx`,
 * `ProfileSettings.tsx`, and `LibraryList.tsx` for implementations.
 */

/** Feature flags implied by {@link isMvpMode} — documentation only, not read at runtime. */
export const appModeMatrix = {
  mvp: {
    homeBottomNav: false,
    scanMarketingHero: false,
    firstRunOnboarding: false,
    preloadHomeRoute: false,
    rootAndBrandLinkToScan: true,
    librarySegmentTabs: false,
    libraryDefaultSegmentAllBooks: true,
    libraryHeroHighlightGrid: false,
    librarySavedViewsAndSmartShelves: false,
    profileReaderDashboard: false,
    profileReadingGoals: false,
    profileLibraryDefaults: false,
    profileScannerPreferences: false,
    profileLibraryShortcutToggles: false,
  },
  full: {
    homeBottomNav: true,
    scanMarketingHero: true,
    firstRunOnboarding: true,
    preloadHomeRoute: true,
    rootAndBrandLinkToScan: false,
    librarySegmentTabs: true,
    libraryDefaultSegmentAllBooks: false,
    libraryHeroHighlightGrid: true,
    librarySavedViewsAndSmartShelves: true,
    profileReaderDashboard: true,
    profileReadingGoals: true,
    profileLibraryDefaults: true,
    profileScannerPreferences: true,
    profileLibraryShortcutToggles: true,
  },
} as const;

/**
 * Opt-in minimal UI for early releases.
 * Build with `VITE_APP_MODE=mvp` (see `npm run build:mvp`).
 * Default / omitted = full app (Home feed, rich profile, marketing hero on Scan).
 */
export function isMvpMode(): boolean {
  return import.meta.env.VITE_APP_MODE === 'mvp';
}
