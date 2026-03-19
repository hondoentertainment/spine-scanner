/**
 * Lightweight error monitoring module.
 *
 * When VITE_SENTRY_DSN is set, initializes Sentry for automatic error
 * reporting, performance monitoring, and breadcrumb tracking.
 * When no DSN is configured, all exports are no-ops — zero runtime cost.
 *
 * Production gate: if MODE is "production" and DSN is absent, a console.warn
 * is emitted once so ops teams know monitoring is dark.
 */

/** Whether Sentry is enabled (DSN is present in env). */
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const IS_PROD = import.meta.env.MODE === 'production';
const IS_ENABLED = !!SENTRY_DSN;

if (!IS_ENABLED && IS_PROD) {
  // Intentionally using console.warn so this appears in production logs / Vercel output.
  // Set VITE_SENTRY_DSN in your deployment environment to silence this.
  console.warn(
    '[ErrorMonitoring] VITE_SENTRY_DSN is not set — production errors will not be reported. ' +
    'Create a project at https://sentry.io and set VITE_SENTRY_DSN in your deployment env vars.'
  );
}

/** Lazily loaded Sentry module (only imported when DSN is present). */
let sentryModule: typeof import('@sentry/react') | null = null;

/**
 * Initialize error monitoring. Call once at app startup (e.g. in main.tsx).
 * No-op if VITE_SENTRY_DSN is not set.
 */
export async function initErrorMonitoring(): Promise<void> {
  if (!IS_ENABLED) return;

  try {
    sentryModule = await import('@sentry/react');
    sentryModule.init({
      dsn: SENTRY_DSN,
      environment: import.meta.env.MODE,
      // Use 5% in production to keep costs low; 100% in other envs for full visibility
      tracesSampleRate: IS_PROD ? 0.05 : 1.0,
      // Only send errors, not warnings
      beforeSend(event) {
        // Strip PII from breadcrumbs
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map(bc => ({
            ...bc,
            // Don't send ISBN values as breadcrumb data
            data: bc.data ? { ...bc.data, isbn: undefined } : bc.data,
          }));
        }
        return event;
      },
    });
    console.log('[ErrorMonitoring] Sentry initialized');
  } catch (err) {
    // Sentry failed to load — continue without monitoring
    console.warn('[ErrorMonitoring] Failed to initialize Sentry:', err);
  }
}

/**
 * Capture an exception. No-op if Sentry is not initialized.
 */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!sentryModule) return;
  sentryModule.captureException(error, context ? { extra: context } : undefined);
}

/**
 * Add a breadcrumb for debugging context. No-op if Sentry is not initialized.
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, string | number | boolean>,
): void {
  if (!sentryModule) return;
  sentryModule.addBreadcrumb({
    category,
    message,
    data,
    level: 'info',
  });
}

/**
 * Set user context for error reports. No-op if Sentry is not initialized.
 */
export function setUser(id: string | null): void {
  if (!sentryModule) return;
  sentryModule.setUser(id ? { id } : null);
}

/** Whether error monitoring is active. */
export function isEnabled(): boolean {
  return IS_ENABLED && sentryModule !== null;
}
