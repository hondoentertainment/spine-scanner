import { canonicalIsbn } from './rank.ts';
import type { CatalogCandidate, OwnedBookSignal } from './types.ts';

export interface RecommendationLlmEnv {
  VITE_RECOMMENDATIONS_LLM?: string;
  VITE_RECOMMENDATIONS_LLM_ENDPOINT?: string;
}

function isAllowedEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    return url.protocol === 'http:' && local;
  } catch {
    return false;
  }
}

/** Off unless the flag is exactly `true` and the endpoint is https (or local http). */
export function readLlmConfig(env: RecommendationLlmEnv = import.meta.env): { endpoint: string } | null {
  if (env.VITE_RECOMMENDATIONS_LLM !== 'true') return null;
  const endpoint = env.VITE_RECOMMENDATIONS_LLM_ENDPOINT?.trim() ?? '';
  if (!isAllowedEndpoint(endpoint)) return null;
  return { endpoint };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseLlmRecommendations(data: unknown): CatalogCandidate[] | null {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { recommendations?: unknown }).recommendations)) {
    return null;
  }
  const candidates: CatalogCandidate[] = [];
  for (const entry of (data as { recommendations: unknown[] }).recommendations) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const title = asString(row.title);
    const author = asString(row.author);
    if (!title || !author) continue;
    const isbn = canonicalIsbn(asString(row.isbn));
    const subjects = Array.isArray(row.subjects)
      ? row.subjects.filter((subject): subject is string => typeof subject === 'string')
      : [];
    const pageCount = typeof row.pageCount === 'number' && row.pageCount > 0 ? Math.round(row.pageCount) : 0;
    const coverImg = asString(row.coverImg);
    const reason = asString(row.reason);
    candidates.push({
      title,
      author,
      isbn,
      isbns: isbn ? [isbn] : [],
      pageCount,
      coverImg,
      subjects,
      seriesName: asString(row.seriesName) || undefined,
      source: 'llm',
      reason: reason || undefined,
    });
  }
  return candidates;
}

/**
 * Optional suggestions endpoint. Returns null on failure so the caller can use
 * Google Books and Open Library instead. Does not throw.
 */
export async function fetchLlmRecommendations(
  owned: OwnedBookSignal[],
  endpoint: string,
  fetchImpl: typeof fetch,
): Promise<CatalogCandidate[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({
        owned: owned.slice(0, 40).map((book) => ({
          title: book.title,
          author: book.author,
          subjects: book.subjects.slice(0, 8),
          series: book.seriesName ?? '',
        })),
        limit: 12,
      }),
    });
    if (!response.ok) return null;
    return parseLlmRecommendations(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
