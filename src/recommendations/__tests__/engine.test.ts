import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookEntry } from '../../types.ts';
import { clearRecommendationCache, writeRecommendationCache } from '../cache.ts';
import { loadRecommendations } from '../engine.ts';
import { libraryFingerprint } from '../rank.ts';
import type { BookRecommendation } from '../types.ts';

const book = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: overrides.id ?? 'book',
  isbn: overrides.isbn ?? '9780441172719',
  title: overrides.title ?? 'Dune',
  author: overrides.author ?? 'Frank Herbert',
  pageCount: 400,
  amazonLink: '',
  coverImg: '',
  status: 'read',
  notes: '',
  dateAdded: overrides.dateAdded ?? '2026-01-01T00:00:00.000Z',
  shelfIds: [],
  ...overrides,
});

const suggestion = (overrides: Partial<BookRecommendation> = {}): BookRecommendation => ({
  id: 'isbn:9780441007462',
  title: 'The Left Hand of Darkness',
  author: 'Ursula K. Le Guin',
  isbn: '9780441007462',
  isbns: ['9780441007462'],
  pageCount: 304,
  coverImg: '',
  reason: 'Because you own Dune and Hyperion',
  becauseTitles: ['Dune', 'Hyperion'],
  source: 'open_library',
  ...overrides,
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function olDoc(title: string, author: string, isbn: string, subjects: string[]) {
  return { title, author_name: [author], isbn: [isbn], subject: subjects, cover_i: 10, number_of_pages_median: 300 };
}

const shelf = [
  book({ id: 'dune', title: 'Dune', author: 'Frank Herbert', isbn: '9780441172719', dateAdded: '2026-02-01T00:00:00.000Z' }),
  book({ id: 'hyperion', title: 'Hyperion', author: 'Dan Simmons', isbn: '9780553283686', dateAdded: '2026-03-01T00:00:00.000Z' }),
];

describe('loadRecommendations', () => {
  afterEach(() => {
    clearRecommendationCache();
    vi.unstubAllGlobals();
  });

  it('does not call the network for an empty library', async () => {
    const fetchImpl = vi.fn();
    const result = await loadRecommendations([], { fetchImpl, llmEnv: null });
    expect(result).toEqual({ recommendations: [], origin: 'empty', notice: '' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns a fresh cache without calling the network', async () => {
    const saved = suggestion();
    writeRecommendationCache({
      fingerprint: libraryFingerprint(shelf),
      fetchedAt: 1_000,
      recommendations: [saved],
    });
    const fetchImpl = vi.fn();
    const result = await loadRecommendations(shelf, { fetchImpl, now: 5_000, online: true, llmEnv: null });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.origin).toBe('cache');
    expect(result.recommendations[0].title).toBe('The Left Hand of Darkness');
    expect(result.notice).toBe('');
  });

  it('shows saved suggestions offline and skips the network', async () => {
    writeRecommendationCache({
      fingerprint: 'stale',
      fetchedAt: 1_000,
      recommendations: [suggestion()],
    });
    const fetchImpl = vi.fn();
    const result = await loadRecommendations(shelf, { fetchImpl, online: false, llmEnv: null });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.origin).toBe('cache');
    expect(result.notice).toBe('You are offline. Showing saved suggestions.');
    expect(result.recommendations).toHaveLength(1);
  });

  it('tells the reader when offline with nothing saved', async () => {
    const result = await loadRecommendations(shelf, { fetchImpl: vi.fn(), online: false, llmEnv: null });
    expect(result.origin).toBe('empty');
    expect(result.notice).toMatch(/offline/i);
    expect(result.recommendations).toEqual([]);
  });

  it('keeps the saved list when every metadata call fails', async () => {
    writeRecommendationCache({
      fingerprint: libraryFingerprint(shelf),
      fetchedAt: 1,
      recommendations: [suggestion()],
    });
    const fetchImpl = vi.fn(async () => jsonResponse({ error: true }, 503));
    const result = await loadRecommendations(shelf, {
      fetchImpl,
      now: RECOMMENDATION_STALE,
      online: true,
      force: true,
      llmEnv: null,
    });
    expect(result.origin).toBe('cache');
    expect(result.notice).toBe("Couldn't refresh suggestions. Showing saved ones.");
    expect(result.recommendations[0].reason).toBe('Because you own Dune and Hyperion');
  });

  it('returns an empty notice when refresh fails and nothing is cached', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const result = await loadRecommendations(shelf, { fetchImpl, online: true, llmEnv: null });
    expect(result.recommendations).toEqual([]);
    expect(result.notice).toBe("Couldn't load suggestions right now. Your library is unchanged.");
  });

  it('suggests books the shelf does not already own and explains them', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('isbn=9780441172719')) {
        return jsonResponse({ docs: [{ subject: ['Science fiction', 'Fiction'] }] });
      }
      if (url.includes('isbn=9780553283686')) {
        return jsonResponse({ docs: [{ subject: ['Science fiction', 'Space opera'] }] });
      }
      if (url.includes('author=Frank+Herbert') || url.includes('author=Frank%20Herbert')) {
        return jsonResponse({
          docs: [
            olDoc('Dune', 'Frank Herbert', '9780441172719', ['Science fiction']),
            olDoc('Dune (Paperback)', 'Herbert, Frank', '9780441007462', ['Science fiction']),
            olDoc('Dune Messiah', 'Frank Herbert', '9780441013593', ['Science fiction']),
          ],
        });
      }
      if (url.includes('author=Dan+Simmons') || url.includes('author=Dan%20Simmons')) {
        return jsonResponse({ docs: [olDoc('Hyperion', 'Dan Simmons', '9780553283686', ['Science fiction'])] });
      }
      if (url.includes('subject=science+fiction') || url.includes('subject=science%20fiction')) {
        return jsonResponse({
          docs: [olDoc('The Left Hand of Darkness', 'Ursula K. Le Guin', '9780061054884', ['Science fiction'])],
        });
      }
      if (url.includes('googleapis.com')) {
        throw new Error(`Google Books should not be required: ${url}`);
      }
      return jsonResponse({ docs: [] });
    });

    const result = await loadRecommendations(shelf, { fetchImpl, online: true, llmEnv: null, now: 50_000 });
    expect(result.origin).toBe('network');
    expect(result.notice).toBe('');
    const titles = result.recommendations.map((item) => item.title);
    expect(titles).toContain('Dune Messiah');
    expect(titles).toContain('The Left Hand of Darkness');
    expect(titles).not.toContain('Dune');
    expect(titles).not.toContain('Dune (Paperback)');
    expect(titles).not.toContain('Hyperion');
    expect(result.recommendations.find((item) => item.title === 'The Left Hand of Darkness')?.reason)
      .toBe('Because you own Dune and Hyperion');
    expect(result.recommendations.find((item) => item.title === 'Dune Messiah')?.reason)
      .toBe('Because you own Dune');
  });

  it('asks Google Books when Open Library has no author matches', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('googleapis.com') && url.includes('inauthor')) {
        return jsonResponse({
          items: [{
            volumeInfo: {
              title: 'Dune Messiah',
              authors: ['Frank Herbert'],
              printType: 'BOOK',
              industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780441013593' }],
            },
          }],
        });
      }
      return jsonResponse({ docs: [] });
    });
    const result = await loadRecommendations(
      [book({ seriesName: 'Dune' })],
      { fetchImpl, online: true, llmEnv: null },
    );
    expect(result.recommendations.map((item) => item.title)).toContain('Dune Messiah');
    expect(result.recommendations.find((item) => item.title === 'Dune Messiah')?.reason).toBe('Because you own Dune');
    expect(fetchImpl.mock.calls.some((call) => String(call[0]).includes('googleapis.com'))).toBe(true);
  });

  it('keeps a later series volume when the catalog subject names the series', async () => {
    const expanse = book({
      id: 'wakes',
      title: 'Leviathan Wakes',
      author: 'James S. A. Corey',
      isbn: '9780316129084',
      seriesName: 'The Expanse',
    });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('isbn=')) return jsonResponse({ docs: [{ subject: ['Science fiction'] }] });
      if (url.includes('q=The+Expanse') || url.includes('q=The%20Expanse')) {
        return jsonResponse({
          docs: [olDoc("Caliban's War", 'James S. A. Corey', '9781841499901', ['The Expanse', 'Science fiction'])],
        });
      }
      return jsonResponse({ docs: [] });
    });
    const result = await loadRecommendations([expanse], { fetchImpl, online: true, llmEnv: null });
    const match = result.recommendations.find((item) => item.title === "Caliban's War");
    expect(match?.reason).toBe('Because you own Leviathan Wakes');
    expect(match?.seriesName).toBe('The Expanse');
  });

  it('uses the optional endpoint when the flag is on and falls back when it fails', async () => {
    const endpoint = 'https://suggestions.example/recommendations';
    const llmFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === endpoint) {
        return jsonResponse({
          recommendations: [
            {
              title: 'The Left Hand of Darkness',
              author: 'Ursula K. Le Guin',
              isbn: '9780061054884',
              reason: 'Because you own Dune and Hyperion',
            },
            {
              title: 'Dune',
              author: 'Frank Herbert',
              isbn: '9780441172719',
              reason: 'Because you own Hyperion',
            },
          ],
        });
      }
      throw new Error(`free path should not run: ${url}`);
    });

    const fromLlm = await loadRecommendations(shelf, {
      fetchImpl: llmFetch,
      online: true,
      llmEnv: { VITE_RECOMMENDATIONS_LLM: 'true', VITE_RECOMMENDATIONS_LLM_ENDPOINT: endpoint },
    });
    expect(fromLlm.origin).toBe('network');
    expect(fromLlm.recommendations.map((item) => item.title)).toEqual(['The Left Hand of Darkness']);
    expect(llmFetch).toHaveBeenCalledTimes(1);

    const fallbackFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === endpoint) return jsonResponse({ error: true }, 500);
      if (url.includes('isbn=')) return jsonResponse({ docs: [{ subject: ['Science fiction'] }] });
      if (url.includes('author=Frank')) return jsonResponse({ docs: [olDoc('Dune Messiah', 'Frank Herbert', '9780441013593', [])] });
      return jsonResponse({ docs: [] });
    });
    const fallback = await loadRecommendations(shelf, {
      fetchImpl: fallbackFetch,
      online: true,
      force: true,
      now: 90_000,
      llmEnv: { VITE_RECOMMENDATIONS_LLM: 'true', VITE_RECOMMENDATIONS_LLM_ENDPOINT: endpoint },
    });
    expect(fallback.recommendations.map((item) => item.title)).toContain('Dune Messiah');
    expect(fallbackFetch.mock.calls.some((call) => String(call[0]) === endpoint)).toBe(true);
    expect(fallbackFetch.mock.calls.some((call) => String(call[0]).includes('openlibrary.org'))).toBe(true);
  });

  it('ignores the optional endpoint unless the flag is on', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ docs: [] }));
    await loadRecommendations(shelf, {
      fetchImpl,
      online: true,
      force: true,
      llmEnv: { VITE_RECOMMENDATIONS_LLM: 'false', VITE_RECOMMENDATIONS_LLM_ENDPOINT: 'https://suggestions.example/recommendations' },
    });
    expect(fetchImpl.mock.calls.some((call) => String(call[0]).includes('suggestions.example'))).toBe(false);
    await loadRecommendations([book()], {
      fetchImpl,
      online: true,
      force: true,
      llmEnv: { VITE_RECOMMENDATIONS_LLM: 'true', VITE_RECOMMENDATIONS_LLM_ENDPOINT: 'http://evil.example/recommendations' },
    });
    expect(fetchImpl.mock.calls.some((call) => String(call[0]).includes('evil.example'))).toBe(false);
  });
});

const RECOMMENDATION_STALE = 1 + (13 * 60 * 60 * 1000);
