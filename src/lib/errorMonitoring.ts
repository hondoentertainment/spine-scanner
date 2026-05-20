/**
 * Lightweight error monitoring module.
 *
 * When VITE_SENTRY_DSN is set, initializes Sentry for automatic error
 * reporting, performance monitoring, and breadcrumb tracking.
 * When no DSN is configured, all exports are no-ops — zero runtime cost.
 */

/** Whether Sentry is enabled (DSN is present in env). */
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const APP_RELEASE = import.meta.env.VITE_APP_RELEASE as string | undefined;
const APP_ENVIRONMENT = (import.meta.env.VITE_APP_ENV as string | undefined) || import.meta.env.MODE;
const BASE_PATH = (import.meta.env.VITE_BASE_PATH as string | undefined) || import.meta.env.BASE_URL;
const IS_ENABLED = !!SENTRY_DSN;
const REDACTED = '[redacted]';
const SENSITIVE_KEY_PATTERN = /user(id)?|email|isbn|title|author|note|highlight|cover|image|photo|token|password|secret/i;

/** Lazily loaded Sentry module (only imported when DSN is present). */
let sentryModule: typeof import('@sentry/react') | null = null;
let initPromise: Promise<void> | null = null;

function scrubValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === 'object') {
    return scrubObject(value as Record<string, unknown>);
  }
  if (typeof value === 'string') {
    if (value.startsWith('data:image/')) return REDACTED;
    if (/^\S+@\S+\.\S+$/.test(value)) return REDACTED;
  }
  return value;
}

function scrubObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : scrubValue(entry),
    ]),
  ) as T;
}

/**
 * Initialize error monitoring. Call once at app startup (e.g. in main.tsx).
 * No-op if VITE_SENTRY_DSN is not set.
 */
export async function initErrorMonitoring(): Promise<void> {
  if (!IS_ENABLED) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      sentryModule = await import('@sentry/react');
      sentryModule.init({
        dsn: SENTRY_DSN,
        environment: APP_ENVIRONMENT,
        release: APP_RELEASE,
        // Sample 10% of transactions for performance monitoring
        tracesSampleRate: 0.1,
        // Only send errors, not warnings
        beforeSend(event) {
          delete event.user;
          if (event.contexts) event.contexts = scrubObject(event.contexts);
          if (event.extra) event.extra = scrubObject(event.extra);

          // Strip PII from breadcrumbs
          if (event.breadcrumbs) {
            event.breadcrumbs = event.breadcrumbs.map(bc => ({
              ...bc,
              data: bc.data ? scrubObject(bc.data) : bc.data,
            }));
          }
          return event;
        },
      });
      sentryModule.setTag('app_env', APP_ENVIRONMENT);
      sentryModule.setTag('base_path', BASE_PATH);
      if (APP_RELEASE) {
        sentryModule.setTag('app_release', APP_RELEASE);
      }
      console.log('[ErrorMonitoring] Sentry initialized');
    } catch (err) {
      // Sentry failed to load — continue without monitoring
      console.warn('[ErrorMonitoring] Failed to initialize Sentry:', err);
    }
  })();

  return initPromise;
}

export function getErrorMonitoringInitPromise(): Promise<void> | null {
  return initPromise;
}

/**
 * Capture an exception. No-op if Sentry is not initialized.
 */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!sentryModule) return;
  sentryModule.captureException(error, context ? { extra: scrubObject(context) } : undefined);
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
    data: data ? scrubObject(data) as Record<string, string | number | boolean> : undefined,
    level: 'info',
  });
}

/**
 * Set user context for error reports. No-op if Sentry is not initialized.
 */
export function setUser(id: string | null): void {
  if (!sentryModule) return;
  sentryModule.setUser(id ? { id: REDACTED } : null);
}

/**
 * Set a structured tag for easier filtering in monitoring dashboards.
 */
export function setTag(key: string, value: string | number | boolean | null | undefined): void {
  if (!sentryModule || value == null) return;
  sentryModule.setTag(key, String(value));
}

/** Whether error monitoring is active. */
export function isEnabled(): boolean {
  return IS_ENABLED && sentryModule !== null;
}
