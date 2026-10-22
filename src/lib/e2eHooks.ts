/**
 * Playwright-only hooks. Vite inlines VITE_E2E_HOOKS, and production builds
 * leave it unset so these reads are dead. Never set the flag on a deploy.
 */
import type { ShelfReviewItem } from '../shelf/types.ts';
export interface E2ESupabaseConfig {
  url: string;
  anonKey: string;
}

export interface E2EAuthSeed {
  id?: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

declare global {
  interface Window {
    __SPINE_E2E_SUPABASE__?: E2ESupabaseConfig;
    __SPINE_E2E_AUTH__?: E2EAuthSeed;
    __SPINE_E2E_SHELF_REVIEW__?: ShelfReviewItem[];
  }
}

export function e2eHooksEnabled(): boolean {
  return import.meta.env.VITE_E2E_HOOKS === 'true';
}

export function readE2ESupabaseConfig(hooksEnabled: boolean): E2ESupabaseConfig | null {
  if (!hooksEnabled || typeof window === 'undefined') return null;
  const config = window.__SPINE_E2E_SUPABASE__;
  if (!config?.url || !config?.anonKey) return null;
  return { url: config.url, anonKey: config.anonKey };
}

export function readE2EAuthSeed(hooksEnabled: boolean): E2EAuthSeed | null {
  if (!hooksEnabled || typeof window === 'undefined') return null;
  const seed = window.__SPINE_E2E_AUTH__;
  if (!seed?.email || !seed?.name) return null;
  return seed;
}

const SHELF_METHODS = new Set(['barcode', 'ocr', 'text-search', 'vision']);

/** Seeded shelf-photo review rows. Ignored unless the E2E build flag is on. */
export function readE2EShelfReview(hooksEnabled: boolean): ShelfReviewItem[] | null {
  if (!hooksEnabled || typeof window === 'undefined') return null;
  const raw = window.__SPINE_E2E_SHELF_REVIEW__;
  if (!Array.isArray(raw)) return null;
  const items = raw.flatMap((item): ShelfReviewItem[] => {
    if (!item || typeof item !== 'object') return [];
    if (typeof item.id !== 'string' || typeof item.title !== 'string' || typeof item.author !== 'string') return [];
    if (item.decision !== 'accept' && item.decision !== 'reject') return [];
    const detectionMethod = SHELF_METHODS.has(item.detectionMethod) ? item.detectionMethod : 'ocr';
    return [{
      id: item.id,
      title: item.title,
      author: item.author,
      isbn: typeof item.isbn === 'string' ? item.isbn : '',
      pageCount: typeof item.pageCount === 'number' ? item.pageCount : 0,
      coverImg: typeof item.coverImg === 'string' ? item.coverImg : '',
      previewUrl: typeof item.previewUrl === 'string' ? item.previewUrl : '',
      confidence: typeof item.confidence === 'number' ? item.confidence : 0,
      decision: item.decision,
      metadataSource: item.metadataSource ?? 'manual',
      detectionMethod,
      needsReview: Boolean(item.needsReview),
      reviewReason: typeof item.reviewReason === 'string' ? item.reviewReason : '',
      rawText: typeof item.rawText === 'string' ? item.rawText : '',
    }];
  });
  return items.length > 0 ? items : null;
}
