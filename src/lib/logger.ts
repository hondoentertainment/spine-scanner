/**
 * Structured logging utility.
 *
 * - Development: all levels output to console with [LEVEL] prefix and timestamp.
 * - Production: debug/info are suppressed; warn/error are routed to Sentry
 *   breadcrumbs via the errorMonitoring module.
 */

import { addBreadcrumb } from './errorMonitoring.ts';

const IS_PROD = import.meta.env.PROD;

function timestamp(): string {
  return new Date().toISOString();
}

function formatData(data?: Record<string, unknown>): string {
  if (!data) return '';
  try {
    return ' ' + JSON.stringify(data);
  } catch {
    return ' [unserializable data]';
  }
}

/** Convert data values to breadcrumb-compatible types, stringifying complex values. */
function toBreadcrumbData(
  data?: Record<string, unknown>,
): Record<string, string | number | boolean> | undefined {
  if (!data) return undefined;
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
    } else if (value == null) {
      result[key] = String(value);
    } else {
      try {
        result[key] = JSON.stringify(value);
      } catch {
        result[key] = '[unserializable]';
      }
    }
  }
  return result;
}

export const logger = {
  debug(msg: string, data?: Record<string, unknown>): void {
    if (!IS_PROD) {
      // eslint-disable-next-line no-console
      console.debug(`[DEBUG] ${timestamp()} ${msg}${formatData(data)}`);
    }
    // In production, debug is suppressed entirely.
  },

  info(msg: string, data?: Record<string, unknown>): void {
    if (!IS_PROD) {
      // eslint-disable-next-line no-console
      console.info(`[INFO] ${timestamp()} ${msg}${formatData(data)}`);
    }
    // In production, info is suppressed entirely.
  },

  warn(msg: string, data?: Record<string, unknown>): void {
    if (IS_PROD) {
      addBreadcrumb('logger.warn', msg, toBreadcrumbData(data));
    } else {
      // eslint-disable-next-line no-console
      console.warn(`[WARN] ${timestamp()} ${msg}${formatData(data)}`);
    }
  },

  error(msg: string, data?: Record<string, unknown>): void {
    if (IS_PROD) {
      addBreadcrumb('logger.error', msg, toBreadcrumbData(data));
    } else {
      // eslint-disable-next-line no-console
      console.error(`[ERROR] ${timestamp()} ${msg}${formatData(data)}`);
    }
  },
};
