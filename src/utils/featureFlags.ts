/**
 * Feature flags for SpineScanner.
 *
 * Flags are controlled via Vite environment variables (VITE_FLAG_*).
 * All flags default to `true` for production unless explicitly disabled.
 * Set a flag to "false" in your .env or deployment env vars to disable it.
 *
 * Usage:
 *   import { flags } from '../utils/featureFlags';
 *   if (flags.cloudSync) { ... }
 *
 * Adding a new flag:
 *   1. Add it to the `Flags` type below.
 *   2. Add the default value in `resolveFlags()`.
 *   3. Document it in .env.example.
 */

export interface Flags {
  /** Enable Supabase cloud sync. Default: true. Set VITE_FLAG_CLOUD_SYNC=false to disable. */
  cloudSync: boolean;
  /** Enable realtime book subscription via Supabase channels. Default: true. */
  realtimeSync: boolean;
  /** Enable Amazon affiliate links on book cards. Default: true. */
  amazonLinks: boolean;
  /** Enable OCR spine scanning (in addition to barcode). Default: true. */
  ocrScanning: boolean;
  /** Enable smart shelves (rule-based auto-assignment). Default: true. */
  smartShelves: boolean;
  /** Enable batch scan mode. Default: true. */
  batchMode: boolean;
  /** Enable reading progress tracking (page counter). Default: true. */
  readingProgress: boolean;
  /** Show the DebugPanel in non-production environments. Default: true in dev. */
  debugPanel: boolean;
}

function flag(key: string, defaultValue: boolean): boolean {
  const raw = import.meta.env[`VITE_FLAG_${key}`];
  if (raw === undefined || raw === '') return defaultValue;
  return raw !== 'false' && raw !== '0';
}

function resolveFlags(): Flags {
  const isDev = import.meta.env.DEV;
  return {
    cloudSync:        flag('CLOUD_SYNC', true),
    realtimeSync:     flag('REALTIME_SYNC', true),
    amazonLinks:      flag('AMAZON_LINKS', true),
    ocrScanning:      flag('OCR_SCANNING', true),
    smartShelves:     flag('SMART_SHELVES', true),
    batchMode:        flag('BATCH_MODE', true),
    readingProgress:  flag('READING_PROGRESS', true),
    debugPanel:       flag('DEBUG_PANEL', isDev),
  };
}

/** Resolved feature flags. Frozen at module load time (build-time config). */
export const flags: Readonly<Flags> = Object.freeze(resolveFlags());

/** Returns true if all listed flags are enabled. Useful for compound feature gates. */
export function allEnabled(...keys: (keyof Flags)[]): boolean {
  return keys.every((k) => flags[k]);
}
