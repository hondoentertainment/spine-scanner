/**
 * React Router `basename` for subpath deploys (e.g. GitHub Pages `/spine-scanner/`).
 * Omit when app is served from site root.
 */
export function getRouterBasename(): string | undefined {
  const base = import.meta.env.BASE_URL ?? '/';
  if (base === '/' || base === '') return undefined;
  return base.endsWith('/') ? base.slice(0, -1) : base;
}
