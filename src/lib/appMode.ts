/**
 * Opt-in minimal UI for early releases.
 * Build with `VITE_APP_MODE=mvp` (see `npm run build:mvp`).
 * Default / omitted = full app (Home feed, rich profile, marketing hero on Scan).
 */
export function isMvpMode(): boolean {
  return import.meta.env.VITE_APP_MODE === 'mvp';
}
