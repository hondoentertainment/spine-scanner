import type { BookRecommendation } from './types.ts';

export const RECOMMENDATION_CACHE_KEY = 'spinescanner.recommendations.v1';
export const SUBJECT_CACHE_KEY = 'spinescanner.recommendation-subjects.v1';

export const RECOMMENDATION_FRESH_MS = 12 * 60 * 60 * 1000;
const SUBJECT_FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SUBJECTS = 200;

export interface RecommendationCacheFile {
  fingerprint: string;
  fetchedAt: number;
  recommendations: BookRecommendation[];
}

interface SubjectEntry {
  subjects: string[];
  savedAt: number;
  workKey?: string;
}

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function isRecommendation(value: unknown): value is BookRecommendation {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<BookRecommendation>;
  return typeof row.id === 'string'
    && typeof row.title === 'string'
    && typeof row.author === 'string'
    && typeof row.reason === 'string'
    && Array.isArray(row.becauseTitles)
    && row.becauseTitles.every((title) => typeof title === 'string')
    && (row.source === 'google_books' || row.source === 'open_library' || row.source === 'llm');
}

export function readRecommendationCache(): RecommendationCacheFile | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(RECOMMENDATION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RecommendationCacheFile>;
    if (!parsed || typeof parsed.fingerprint !== 'string' || typeof parsed.fetchedAt !== 'number') return null;
    if (!Array.isArray(parsed.recommendations)) return null;
    const recommendations = parsed.recommendations.filter(isRecommendation).map((recommendation) => ({
      ...recommendation,
      isbn: typeof recommendation.isbn === 'string' ? recommendation.isbn : '',
      isbns: Array.isArray(recommendation.isbns) ? recommendation.isbns.filter((isbn) => typeof isbn === 'string') : [],
      pageCount: typeof recommendation.pageCount === 'number' ? recommendation.pageCount : 0,
      coverImg: typeof recommendation.coverImg === 'string' ? recommendation.coverImg : '',
    }));
    return { fingerprint: parsed.fingerprint, fetchedAt: parsed.fetchedAt, recommendations };
  } catch {
    return null;
  }
}

export function writeRecommendationCache(file: RecommendationCacheFile): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(RECOMMENDATION_CACHE_KEY, JSON.stringify(file));
  } catch {
    /* quota or private mode */
  }
}

function readSubjectStore(): Record<string, SubjectEntry> {
  const store = storage();
  if (!store) return {};
  try {
    const raw = store.getItem(SUBJECT_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SubjectEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function readCachedSubjects(isbn: string, now: number): string[] | null {
  const entry = readSubjectStore()[isbn];
  if (!entry || !Array.isArray(entry.subjects) || typeof entry.savedAt !== 'number') return null;
  if (now - entry.savedAt > SUBJECT_FRESH_MS) return null;
  return entry.subjects.filter((subject) => typeof subject === 'string');
}

export function readCachedWorkKey(isbn: string, now: number): string {
  const entry = readSubjectStore()[isbn];
  if (!entry || typeof entry.savedAt !== 'number') return '';
  if (now - entry.savedAt > SUBJECT_FRESH_MS) return '';
  return typeof entry.workKey === 'string' ? entry.workKey : '';
}

export function writeCachedSubjects(isbn: string, subjects: string[], now: number, workKey = ''): void {
  const store = storage();
  if (!store) return;
  const current = readSubjectStore();
  current[isbn] = { subjects, savedAt: now, ...(workKey ? { workKey } : {}) };
  const fresh = Object.entries(current)
    .filter(([, entry]) => now - entry.savedAt <= SUBJECT_FRESH_MS)
    .sort((a, b) => b[1].savedAt - a[1].savedAt)
    .slice(0, MAX_SUBJECTS);
  try {
    store.setItem(SUBJECT_CACHE_KEY, JSON.stringify(Object.fromEntries(fresh)));
  } catch {
    /* quota or private mode */
  }
}

export function clearRecommendationCache(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(RECOMMENDATION_CACHE_KEY);
    store.removeItem(SUBJECT_CACHE_KEY);
  } catch {
    /* ignore */
  }
}
