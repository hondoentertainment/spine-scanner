import { resolveAppRelease } from './releaseFromBuildEnv.ts';

export { releaseFromBuildEnv, resolveAppRelease } from './releaseFromBuildEnv.ts';

/**
 * Vercel production sets VITE_APP_ENV and does not set VITE_APP_RELEASE.
 * Falling back to the literal "dev-local" is what painted
 * "Release dev-local · production" on Home. import.meta.env.DEV is only the
 * Vite dev server, so it is the wrong switch for that footer. Regular screens
 * never show a release. Profile diagnostics do, and a missing production
 * release stays blank instead of pretending to be dev-local.
 */
export function readClientAppMeta(): { release: string; environment: string } {
  const environment = (import.meta.env.VITE_APP_ENV || import.meta.env.MODE || '').trim();
  return {
    release: resolveAppRelease(import.meta.env.VITE_APP_RELEASE, Boolean(import.meta.env.DEV)),
    environment,
  };
}
