import type { BookEntry } from '../types.ts';
import { isOnline } from '../utils/network.ts';
import {
  RECOMMENDATION_FRESH_MS,
  readCachedSubjects,
  readCachedWorkKey,
  readRecommendationCache,
  writeCachedSubjects,
  writeRecommendationCache,
  type RecommendationCacheFile,
} from './cache.ts';
import { fetchLlmRecommendations, readLlmConfig, type RecommendationLlmEnv } from './llm.ts';
import {
  authorSeeds,
  booksForSubjectLookup,
  canonicalIsbn,
  filterStillRelevant,
  libraryFingerprint,
  mentionsSeries,
  rankRecommendations,
  seriesSeeds,
  subjectSeeds,
} from './rank.ts';
import { lookupOwnedEdition, searchGoogleBooks, searchOpenLibrary, type FetchOutcome } from './sources.ts';
import type { CatalogCandidate, OwnedBookSignal, RecommendationResult } from './types.ts';

export interface LoadRecommendationOptions {
  fetchImpl?: typeof fetch;
  now?: number;
  online?: boolean;
  /** Skip a fresh cache and ask the metadata sources again. */
  force?: boolean;
  /**
   * `null` keeps the free path. Omit to read the build-time env flag.
   * The free path stays the default.
   */
  llmEnv?: RecommendationLlmEnv | null;
}

interface Tally {
  attempted: number;
  succeeded: number;
}

function note<T>(tally: Tally, outcome: FetchOutcome<T>): T {
  tally.attempted += 1;
  if (outcome.ok) tally.succeeded += 1;
  return outcome.value;
}

async function mapPool<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  if (tasks.length === 0) return [];
  const results = new Array<T>(tasks.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await tasks[index]();
    }
  });
  await Promise.all(workers);
  return results;
}

function savedResult(
  cached: RecommendationCacheFile | null,
  books: BookEntry[],
  notice: string,
  emptyNotice: string,
): RecommendationResult {
  const recommendations = cached ? filterStillRelevant(cached.recommendations, books) : [];
  if (recommendations.length === 0) {
    return { recommendations: [], origin: 'empty', notice: emptyNotice };
  }
  return { recommendations, origin: 'cache', notice };
}

/**
 * Cached suggestions for the first paint. Returns null when nothing is saved.
 * Safe to call while the library is already on screen — it does not use the network.
 */
export function peekRecommendations(books: BookEntry[], now = Date.now()): RecommendationResult | null {
  if (books.length === 0) return { recommendations: [], origin: 'empty', notice: '' };
  const cached = readRecommendationCache();
  if (!cached) return null;
  const recommendations = filterStillRelevant(cached.recommendations, books);
  if (recommendations.length === 0) return null;
  const fresh = cached.fingerprint === libraryFingerprint(books) && now - cached.fetchedAt < RECOMMENDATION_FRESH_MS;
  return {
    recommendations,
    origin: 'cache',
    notice: fresh ? '' : 'Showing saved suggestions.',
  };
}

async function attachSubjects(
  books: BookEntry[],
  fetchImpl: typeof fetch,
  now: number,
  tally: Tally,
): Promise<OwnedBookSignal[]> {
  const targets = new Set(booksForSubjectLookup(books).map((book) => book.id));
  const subjectsById = new Map<string, string[]>();
  const workKeyById = new Map<string, string>();
  const tasks: Array<() => Promise<void>> = [];

  for (const book of books) {
    if (!targets.has(book.id)) continue;
    const isbn = canonicalIsbn(book.isbn);
    if (!isbn) continue;
    const cached = readCachedSubjects(isbn, now);
    if (cached) {
      subjectsById.set(book.id, cached);
      const workKey = readCachedWorkKey(isbn, now);
      if (workKey) workKeyById.set(book.id, workKey);
      continue;
    }
    tasks.push(async () => {
      const outcome = await lookupOwnedEdition(isbn, fetchImpl);
      const facts = note(tally, outcome);
      if (outcome.ok) writeCachedSubjects(isbn, facts.subjects, now, facts.workKey);
      subjectsById.set(book.id, facts.subjects);
      if (facts.workKey) workKeyById.set(book.id, facts.workKey);
    });
  }

  await mapPool(tasks, 3);
  return signalsFromBooks(books, subjectsById, workKeyById);
}

async function fetchFreeCandidates(
  books: BookEntry[],
  owned: OwnedBookSignal[],
  fetchImpl: typeof fetch,
  tally: Tally,
): Promise<CatalogCandidate[]> {
  const authors = authorSeeds(books, 3);
  const subjects = subjectSeeds(owned, 3);
  const series = seriesSeeds(books, 2);
  const candidates: CatalogCandidate[] = [];

  const authorHits = (await mapPool(
    authors.map((author) => async () => note(tally, await searchOpenLibrary({ author, limit: '8' }, fetchImpl))),
    3,
  )).flat();
  candidates.push(...authorHits);
  if (authorHits.length === 0 && authors[0]) {
    candidates.push(...note(tally, await searchGoogleBooks(`inauthor:"${authors[0].replace(/["\\]/g, '')}"`, fetchImpl)));
  }

  const subjectHits = (await mapPool(
    subjects.map((subject) => async () => note(tally, await searchOpenLibrary({ subject, limit: '8' }, fetchImpl))),
    3,
  )).flat();
  candidates.push(...subjectHits);
  if (subjectHits.length === 0 && subjects[0]) {
    candidates.push(...note(tally, await searchGoogleBooks(`subject:"${subjects[0].replace(/["\\]/g, '')}"`, fetchImpl)));
  }

  const seriesHits = await mapPool(series.map((seed) => async () => {
    const found = note(tally, await searchOpenLibrary({
      author: seed.author,
      q: seed.series,
      limit: '6',
    }, fetchImpl));
    return found
      .filter((candidate) => mentionsSeries(candidate.title, candidate.subjects, seed.series))
      .map((candidate) => ({ ...candidate, seriesName: seed.series }));
  }), 2);
  candidates.push(...seriesHits.flat());

  return candidates;
}

function signalsFromBooks(
  books: BookEntry[],
  subjectsById = new Map<string, string[]>(),
  workKeyById = new Map<string, string>(),
): OwnedBookSignal[] {
  return books.map((book) => ({
    id: book.id,
    title: book.title,
    author: book.author,
    isbn: book.isbn,
    seriesName: book.seriesName,
    subjects: subjectsById.get(book.id) ?? [],
    isPhotoOnly: book.isPhotoOnly,
    workKey: workKeyById.get(book.id) || undefined,
  }));
}

async function computeRecommendations(
  books: BookEntry[],
  fetchImpl: typeof fetch,
  now: number,
  llmEnv: RecommendationLlmEnv | null | undefined,
): Promise<{ recommendations: RecommendationResult['recommendations']; failed: boolean }> {
  const tally: Tally = { attempted: 0, succeeded: 0 };
  const llm = llmEnv === null ? null : readLlmConfig(llmEnv ?? import.meta.env);
  if (llm) {
    tally.attempted += 1;
    const fromLlm = await fetchLlmRecommendations(signalsFromBooks(books), llm.endpoint, fetchImpl);
    if (fromLlm) {
      tally.succeeded += 1;
      const ranked = rankRecommendations(fromLlm, signalsFromBooks(books));
      if (ranked.length > 0) return { recommendations: ranked, failed: false };
    }
  }

  const owned = await attachSubjects(books, fetchImpl, now, tally);
  const free = await fetchFreeCandidates(books, owned, fetchImpl, tally);
  const ranked = rankRecommendations(free, owned);
  const failed = tally.attempted > 0 && tally.succeeded === 0;
  return { recommendations: ranked, failed };
}

/**
 * Suggest books that are not already on the shelf.
 * Call this from the suggestions view, not while the library list is loading.
 * Network and parser failures return a saved list or an empty notice — they do not throw.
 */
export async function loadRecommendations(
  books: BookEntry[],
  options: LoadRecommendationOptions = {},
): Promise<RecommendationResult> {
  const now = options.now ?? Date.now();
  const online = options.online ?? isOnline();
  const fetchImpl = options.fetchImpl ?? fetch;

  if (books.length === 0) {
    return { recommendations: [], origin: 'empty', notice: '' };
  }

  const fingerprint = libraryFingerprint(books);
  const cached = readRecommendationCache();
  const fresh = Boolean(
    cached
    && cached.fingerprint === fingerprint
    && now - cached.fetchedAt < RECOMMENDATION_FRESH_MS
    && cached.recommendations.length > 0,
  );

  if (fresh && !options.force) {
    const recommendations = filterStillRelevant(cached!.recommendations, books);
    if (recommendations.length > 0) {
      return { recommendations, origin: 'cache', notice: '' };
    }
  }

  if (!online) {
    return savedResult(
      cached,
      books,
      'You are offline. Showing saved suggestions.',
      'You are offline. Suggestions will show up when you reconnect.',
    );
  }

  try {
    const computed = await computeRecommendations(books, fetchImpl, now, options.llmEnv);
    if (computed.recommendations.length > 0) {
      writeRecommendationCache({
        fingerprint,
        fetchedAt: now,
        recommendations: computed.recommendations,
      });
      return { recommendations: computed.recommendations, origin: 'network', notice: '' };
    }
    if (computed.failed) {
      return savedResult(
        cached,
        books,
        "Couldn't refresh suggestions. Showing saved ones.",
        "Couldn't load suggestions right now. Your library is unchanged.",
      );
    }
    return savedResult(
      cached,
      books,
      "Couldn't find new suggestions. Showing saved ones.",
      'No new suggestions right now. Your library is unchanged.',
    );
  } catch {
    return savedResult(
      cached,
      books,
      "Couldn't refresh suggestions. Showing saved ones.",
      "Couldn't load suggestions right now. Your library is unchanged.",
    );
  }
}
