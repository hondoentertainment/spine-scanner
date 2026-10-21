import { canonicalIsbn, distinctiveSubjects } from './rank.ts';
import type { CatalogCandidate } from './types.ts';

const OL_FIELDS = 'title,author_name,isbn,subject,cover_i,number_of_pages_median,key,language,alternative_title';
const REQUEST_TIMEOUT_MS = 8000;

export interface FetchOutcome<T> {
  /** True when the HTTP call returned a usable JSON body, even if that body listed nothing. */
  ok: boolean;
  value: T;
}

function httpsUrl(url: string): string {
  if (url.startsWith('http://')) return `https://${url.slice('http://'.length)}`;
  return url;
}

function asStrings(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim());
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function firstString(value: unknown): string {
  return asStrings(value)[0] ?? '';
}

export function normalizeCatalogWorkKey(raw: unknown): string {
  const value = typeof raw === 'string' ? raw : '';
  const match = value.match(/OL\d+W/i);
  return match ? match[0].toUpperCase() : '';
}

function catalogLanguage(raw: unknown): string {
  return firstString(raw);
}

function collectIsbns(raw: string[]): { isbn: string; isbns: string[] } {
  const isbns: string[] = [];
  for (const entry of raw) {
    const canonical = canonicalIsbn(entry);
    if (!canonical || isbns.includes(canonical)) continue;
    isbns.push(canonical);
    if (isbns.length >= 8) break;
  }
  return { isbn: isbns[0] ?? '', isbns };
}

async function fetchJson(url: string, fetchImpl: typeof fetch): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      credentials: 'omit',
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function parseOpenLibrarySearch(data: unknown, source: CatalogCandidate['source'] = 'open_library'): CatalogCandidate[] {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { docs?: unknown }).docs)) return [];
  const candidates: CatalogCandidate[] = [];
  for (const doc of (data as { docs: unknown[] }).docs) {
    if (!doc || typeof doc !== 'object') continue;
    const row = doc as Record<string, unknown>;
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    const author = firstString(row.author_name);
    if (!title || !author) continue;
    const { isbn, isbns } = collectIsbns(asStrings(row.isbn));
    const coverId = row.cover_i;
    candidates.push({
      title,
      author,
      isbn,
      isbns,
      pageCount: asCount(row.number_of_pages_median),
      coverImg: typeof coverId === 'number' && Number.isFinite(coverId)
        ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
        : '',
      subjects: asStrings(row.subject).slice(0, 20),
      workKey: normalizeCatalogWorkKey(row.key),
      language: catalogLanguage(row.language),
      alternateTitles: asStrings(row.alternative_title).slice(0, 8),
      source,
    });
  }
  return candidates;
}

export function parseGoogleVolumes(data: unknown): CatalogCandidate[] {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { items?: unknown }).items)) return [];
  const candidates: CatalogCandidate[] = [];
  for (const item of (data as { items: unknown[] }).items) {
    if (!item || typeof item !== 'object') continue;
    const info = (item as { volumeInfo?: unknown }).volumeInfo;
    if (!info || typeof info !== 'object') continue;
    const volume = info as Record<string, unknown>;
    if (typeof volume.printType === 'string' && volume.printType !== 'BOOK') continue;
    const title = typeof volume.title === 'string' ? volume.title.trim() : '';
    const author = firstString(volume.authors);
    if (!title || !author) continue;
    const identifiers = Array.isArray(volume.industryIdentifiers)
      ? volume.industryIdentifiers.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const identifier = (entry as { identifier?: unknown }).identifier;
        return typeof identifier === 'string' ? [identifier] : [];
      })
      : [];
    const { isbn, isbns } = collectIsbns(identifiers);
    const imageLinks = volume.imageLinks;
    const thumbnail = imageLinks && typeof imageLinks === 'object'
      ? firstString([(imageLinks as { thumbnail?: unknown }).thumbnail, (imageLinks as { smallThumbnail?: unknown }).smallThumbnail])
      : '';
    const categories = asStrings(volume.categories).flatMap((category) => category.split('/').map((part) => part.trim()));
    candidates.push({
      title,
      author,
      isbn,
      isbns,
      pageCount: asCount(volume.pageCount),
      coverImg: thumbnail ? httpsUrl(thumbnail) : '',
      subjects: categories.slice(0, 20),
      language: typeof volume.language === 'string' ? volume.language : '',
      source: 'google_books',
    });
  }
  return candidates;
}

export function openLibrarySubjects(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const docs = (data as { docs?: unknown }).docs;
  if (!Array.isArray(docs)) return [];
  const subjects: string[] = [];
  for (const doc of docs) {
    if (!doc || typeof doc !== 'object') continue;
    subjects.push(...asStrings((doc as { subject?: unknown }).subject));
  }
  return subjects;
}

export function googleSubjects(data: unknown): string[] {
  return parseGoogleVolumes(data)[0]?.subjects ?? [];
}

export async function searchOpenLibrary(
  params: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<FetchOutcome<CatalogCandidate[]>> {
  const query = new URLSearchParams({ ...params, fields: OL_FIELDS });
  if (!query.get('limit')) query.set('limit', '8');
  const data = await fetchJson(`https://openlibrary.org/search.json?${query.toString()}`, fetchImpl);
  if (!data) return { ok: false, value: [] };
  return { ok: true, value: parseOpenLibrarySearch(data) };
}

export async function searchGoogleBooks(
  query: string,
  fetchImpl: typeof fetch,
): Promise<FetchOutcome<CatalogCandidate[]>> {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=8&printType=books`;
  const data = await fetchJson(url, fetchImpl);
  if (!data) return { ok: false, value: [] };
  return { ok: true, value: parseGoogleVolumes(data) };
}

export interface OwnedEditionFacts {
  subjects: string[];
  workKey: string;
}

function workKeyFromSearch(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const docs = (data as { docs?: unknown }).docs;
  if (!Array.isArray(docs) || !docs[0] || typeof docs[0] !== 'object') return '';
  return normalizeCatalogWorkKey((docs[0] as { key?: unknown }).key);
}

/** Subjects and Open Library work id for one owned ISBN. */
export async function lookupOwnedEdition(
  isbn: string,
  fetchImpl: typeof fetch,
): Promise<FetchOutcome<OwnedEditionFacts>> {
  const canonical = canonicalIsbn(isbn);
  if (!canonical) return { ok: false, value: { subjects: [], workKey: '' } };
  const openLibrary = await fetchJson(
    `https://openlibrary.org/search.json?isbn=${encodeURIComponent(canonical)}&limit=1&fields=subject,key`,
    fetchImpl,
  );
  const workKey = workKeyFromSearch(openLibrary);
  const fromOpenLibrary = openLibrary ? distinctiveSubjects(openLibrarySubjects(openLibrary)) : [];
  if (openLibrary && fromOpenLibrary.length > 0) {
    return { ok: true, value: { subjects: fromOpenLibrary, workKey } };
  }
  const google = await fetchJson(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(`isbn:${canonical}`)}&maxResults=1&printType=books`,
    fetchImpl,
  );
  const fromGoogle = google ? distinctiveSubjects(googleSubjects(google)) : [];
  if (google && fromGoogle.length > 0) return { ok: true, value: { subjects: fromGoogle, workKey } };
  if (openLibrary || google) return { ok: true, value: { subjects: fromOpenLibrary, workKey } };
  return { ok: false, value: { subjects: [], workKey } };
}

/** Subjects for one owned ISBN. Open Library first, then Google Books categories. */
export async function lookupSubjects(
  isbn: string,
  fetchImpl: typeof fetch,
): Promise<FetchOutcome<string[]>> {
  const outcome = await lookupOwnedEdition(isbn, fetchImpl);
  return { ok: outcome.ok, value: outcome.value.subjects };
}
