import { isbn10To13 } from '../utils/isbnValidation.ts';
import { normalizeForMatching } from '../utils/editionDuplicates.ts';
import type { BookRecommendation, CatalogCandidate, OwnedBookSignal } from './types.ts';

export const RECOMMENDATION_LIMIT = 12;
const AUTHOR_MATCH_WEIGHT = 5;
const SERIES_MATCH_WEIGHT = 8;
const SUBJECT_MATCH_WEIGHT = 2;
const MAX_SHARED_SUBJECTS = 4;
/** Links more than this far below the best one are left out of the sentence. */
const CLOSE_WEIGHT = 2;
const MAX_PER_AUTHOR = 3;

const GENERIC_SUBJECTS = new Set([
  'fiction',
  'literature',
  'novels',
  'novel',
  'english',
  'american',
  'english literature',
  'american literature',
  'accessible book',
  'protected daisy',
  'large type books',
  'large print',
  'in library',
  'general',
  'juvenile fiction',
  'juvenile literature',
  'bestsellers',
  'best sellers',
  'bestseller',
  'new york times bestseller',
  'nyt bestseller',
  'reading level',
  'overdrive',
  'books',
  'book',
  'paperback',
  'hardcover',
  'hardback',
  'translations',
  'translated',
  'adapted',
  'open library staff pick',
  'internet archive',
  'long now manual for civilization',
  'to be read',
  'currently reading',
  'owned',
  'library',
  'electronic books',
  'audiobooks',
  'audiobook',
]);

const WEAK_AUTHOR_KEYS = new Set([
  'anonymous',
  'author unknown',
  'unknown',
  'unknown author',
  'various',
  'none',
  'n a',
]);

export interface IdentityBook {
  title: string;
  author: string;
  isbn: string;
  isPhotoOnly?: boolean;
}

export function canonicalIsbn(raw: string | undefined | null): string {
  if (!raw) return '';
  if (raw.startsWith('photo-') || raw.startsWith('wish-')) return '';
  const digits = raw.replace(/[^0-9Xx]/g, '').replace(/x$/i, 'X');
  if (digits.length === 13) return digits;
  if (digits.length === 10) return isbn10To13(digits) ?? '';
  return '';
}

export function normalizeSubject(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[_/]+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isDistinctiveSubject(subject: string): boolean {
  if (subject.length < 4) return false;
  if (GENERIC_SUBJECTS.has(subject)) return false;
  if (/\d{3,}/.test(subject)) return false;
  if (subject.includes('bestseller') || subject.includes('best seller')) return false;
  if (subject.includes('reading level')) return false;
  if (subject.includes('accessible')) return false;
  if (subject.includes('daisy')) return false;
  if (subject.includes('large type') || subject.includes('large print')) return false;
  if (subject.includes('overdrive')) return false;
  return true;
}

export function distinctiveSubjects(subjects: string[], limit = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of subjects) {
    const key = normalizeSubject(raw);
    if (!isDistinctiveSubject(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= limit) break;
  }
  return out;
}

function primaryAuthorChunk(author: string): string {
  const trimmed = author.trim();
  if (!trimmed) return '';
  const chunk = trimmed.split(/\s+(?:and|&)\s+|\s*;\s*|\s*\/\s*/i)[0] ?? trimmed;
  const comma = chunk.indexOf(',');
  if (comma <= 0) return chunk;
  const left = chunk.slice(0, comma).trim();
  const right = chunk.slice(comma + 1).trim();
  if (!left || !right || right.includes(',')) return left;
  const leftWords = left.split(/\s+/).filter(Boolean);
  const rightWords = right.split(/\s+/).filter(Boolean);
  const rightHasInitial = rightWords.some((word) => word.replace(/\./g, '').length === 1);
  if (leftWords.length >= 2 && rightWords.length >= 2 && !rightHasInitial) return left;
  return `${right} ${left}`.trim();
}

/** Order-insensitive author key so "Herbert, Frank" matches "Frank Herbert". */
export function authorKey(author: string): string {
  const tokens = normalizeForMatching(primaryAuthorChunk(author))
    .split(' ')
    .filter((token) => token.length > 1);
  return [...tokens].sort().join(' ');
}

export function isWeakAuthor(key: string): boolean {
  return !key || WEAK_AUTHOR_KEYS.has(key);
}

export function displayAuthor(author: string): string {
  return primaryAuthorChunk(author).replace(/\s+/g, ' ').trim();
}

export function editionKey(title: string, author: string): string {
  const normalizedTitle = normalizeForMatching(title);
  const normalizedAuthor = authorKey(author);
  if (!normalizedTitle || isWeakAuthor(normalizedAuthor)) return '';
  return `${normalizedTitle}|${normalizedAuthor}`;
}

export function becauseYouOwn(titles: string[]): string {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const title of titles) {
    const trimmed = title.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  if (unique.length === 0) return '';
  if (unique.length === 1) return `Because you own ${unique[0]}`;
  if (unique.length === 2) return `Because you own ${unique[0]} and ${unique[1]}`;
  return `Because you own ${unique[0]}, ${unique[1]}, and ${unique.length - 2} more`;
}

function titlesMatch(owned: string, cited: string): boolean {
  if (owned.trim().toLowerCase() === cited.trim().toLowerCase()) return true;
  const left = normalizeForMatching(owned);
  const right = normalizeForMatching(cited);
  return Boolean(left && left === right);
}

/**
 * Accept a provider reason only when it names books on the shelf and nothing else.
 * Titles that contain "and" are matched whole, longest first.
 */
export function acceptShelfReason(
  reason: string,
  ownedTitles: string[],
): { reason: string; becauseTitles: string[] } | null {
  const compact = reason.trim().replace(/\s+/g, ' ');
  const match = compact.match(/^because you own\s+(.+?)\.?$/i);
  if (!match) return null;
  const rest = match[1].trim();
  if (!rest) return null;

  const sorted = [...ownedTitles]
    .map((title) => title.trim())
    .filter((title) => title.length >= 2)
    .sort((a, b) => b.length - a.length);
  const becauseTitles: string[] = [];
  let leftover = ` ${rest.toLowerCase()} `;
  for (const title of sorted) {
    const needle = title.toLowerCase();
    const idx = leftover.indexOf(needle);
    if (idx === -1) continue;
    const before = leftover[idx - 1] ?? ' ';
    const after = leftover[idx + needle.length] ?? ' ';
    if (!/[\s,.]/.test(before) || !/[\s,.]/.test(after)) continue;
    becauseTitles.push(title);
    leftover = `${leftover.slice(0, idx)} ${leftover.slice(idx + needle.length)}`;
  }
  if (becauseTitles.length === 0) return null;

  const residue = leftover
    .replace(/\d+\s+more/g, ' ')
    .replace(/\band\b/g, ' ')
    .replace(/[,.]/g, ' ')
    .trim();
  if (residue.length > 0) return null;

  return {
    reason: `Because you own ${rest.replace(/\.$/, '')}`,
    becauseTitles,
  };
}

function subjectSet(subjects: string[]): Set<string> {
  return new Set(distinctiveSubjects(subjects, 24));
}

interface ScoredLink {
  title: string;
  weight: number;
  index: number;
}

function linksFor(candidate: CatalogCandidate, owned: OwnedBookSignal[]): ScoredLink[] {
  const candidateAuthor = authorKey(candidate.author);
  const candidateSeries = normalizeForMatching(candidate.seriesName ?? '');
  const candidateSubjects = subjectSet(candidate.subjects);
  const links: ScoredLink[] = [];

  owned.forEach((book, index) => {
    let weight = 0;
    const bookAuthor = authorKey(book.author);
    if (candidateAuthor && bookAuthor && candidateAuthor === bookAuthor && !isWeakAuthor(bookAuthor)) {
      weight += AUTHOR_MATCH_WEIGHT;
    }
    const bookSeries = normalizeForMatching(book.seriesName ?? '');
    if (candidateSeries && bookSeries && candidateSeries === bookSeries) {
      weight += SERIES_MATCH_WEIGHT;
    }
    if (candidateSubjects.size > 0) {
      let shared = 0;
      for (const subject of subjectSet(book.subjects)) {
        if (!candidateSubjects.has(subject)) continue;
        shared += 1;
        if (shared >= MAX_SHARED_SUBJECTS) break;
      }
      weight += shared * SUBJECT_MATCH_WEIGHT;
    }
    if (weight > 0) links.push({ title: book.title, weight, index });
  });

  links.sort((a, b) => b.weight - a.weight || a.index - b.index);
  return links;
}

function formatFromLinks(links: ScoredLink[]): { reason: string; becauseTitles: string[]; score: number } | null {
  if (links.length === 0) return null;
  const best = links[0].weight;
  const close = links.filter((link) => best - link.weight <= CLOSE_WEIGHT);
  const unique: ScoredLink[] = [];
  const seen = new Set<string>();
  for (const link of close) {
    const key = link.title.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(link);
  }
  if (unique.length === 0) return null;
  const named = unique.slice(0, 2).map((link) => link.title);
  const extra = unique.length - named.length;
  const reason = extra > 0
    ? `Because you own ${named[0]}, ${named[1]}, and ${extra} more`
    : becauseYouOwn(named);
  if (!reason) return null;
  return {
    reason,
    becauseTitles: named,
    score: links.reduce((sum, link) => sum + link.weight, 0),
  };
}

export function isAlreadyInLibrary(
  item: { title: string; author: string; isbn?: string; isbns?: string[] },
  library: IdentityBook[],
): boolean {
  const wanted = new Set<string>();
  for (const raw of [item.isbn, ...(item.isbns ?? [])]) {
    const canonical = canonicalIsbn(raw);
    if (canonical) wanted.add(canonical);
  }
  const edition = editionKey(item.title, item.author);
  for (const book of library) {
    const ownedIsbn = canonicalIsbn(book.isbn);
    if (ownedIsbn && wanted.has(ownedIsbn)) return true;
    if (edition && editionKey(book.title, book.author) === edition) return true;
  }
  return false;
}

export function libraryHasTitle(library: Array<{ title: string }>, title: string): boolean {
  return library.some((book) => titlesMatch(book.title, title));
}

export function filterStillRelevant(
  recommendations: BookRecommendation[],
  library: IdentityBook[],
): BookRecommendation[] {
  return recommendations.filter((recommendation) => {
    if (isAlreadyInLibrary(recommendation, library)) return false;
    return recommendation.becauseTitles.some((title) => libraryHasTitle(library, title));
  });
}

function candidateIdentity(candidate: CatalogCandidate): string {
  const isbn = candidate.isbns.map((value) => canonicalIsbn(value)).find(Boolean) || canonicalIsbn(candidate.isbn);
  if (isbn) return `isbn:${isbn}`;
  const edition = editionKey(candidate.title, candidate.author);
  return edition ? `edition:${edition}` : '';
}

function mergeCandidates(candidates: CatalogCandidate[]): CatalogCandidate[] {
  const merged = new Map<string, CatalogCandidate>();
  for (const candidate of candidates) {
    const title = candidate.title.trim();
    const author = candidate.author.trim();
    if (!title || !author || isWeakAuthor(authorKey(author))) continue;
    const id = candidateIdentity({ ...candidate, title, author });
    if (!id) continue;
    const previous = merged.get(id);
    if (!previous) {
      merged.set(id, { ...candidate, title, author });
      continue;
    }
    const subjects = [...previous.subjects];
    for (const subject of candidate.subjects) {
      if (!subjects.some((existing) => normalizeSubject(existing) === normalizeSubject(subject))) {
        subjects.push(subject);
      }
    }
    const isbns = [...previous.isbns];
    for (const isbn of [candidate.isbn, ...candidate.isbns]) {
      const canonical = canonicalIsbn(isbn);
      if (canonical && !isbns.includes(canonical)) isbns.push(canonical);
    }
    merged.set(id, {
      ...previous,
      isbn: previous.isbn || candidate.isbn,
      isbns,
      pageCount: previous.pageCount || candidate.pageCount,
      coverImg: previous.coverImg || candidate.coverImg,
      subjects,
      seriesName: previous.seriesName || candidate.seriesName,
      reason: previous.reason || candidate.reason,
    });
  }
  return [...merged.values()];
}

export function rankRecommendations(
  candidates: CatalogCandidate[],
  owned: OwnedBookSignal[],
  limit = RECOMMENDATION_LIMIT,
): BookRecommendation[] {
  const ownedTitles = owned.map((book) => book.title);
  const scored: Array<BookRecommendation & { score: number }> = [];

  for (const candidate of mergeCandidates(candidates)) {
    if (isAlreadyInLibrary(candidate, owned)) continue;
    const links = linksFor(candidate, owned);
    const algorithmic = formatFromLinks(links);
    const external = candidate.reason ? acceptShelfReason(candidate.reason, ownedTitles) : null;
    const chosen = external ?? algorithmic;
    if (!chosen) continue;
    const score = external
      ? Math.max(algorithmic?.score ?? 0, external.becauseTitles.length)
      : algorithmic?.score ?? 0;
    const isbn = canonicalIsbn(candidate.isbn) || candidate.isbns.map((value) => canonicalIsbn(value)).find(Boolean) || '';
    scored.push({
      id: candidateIdentity(candidate),
      title: candidate.title,
      author: displayAuthor(candidate.author),
      isbn,
      isbns: candidate.isbns.map((value) => canonicalIsbn(value)).filter(Boolean),
      pageCount: candidate.pageCount > 0 ? candidate.pageCount : 0,
      coverImg: candidate.coverImg,
      seriesName: candidate.seriesName,
      reason: chosen.reason,
      becauseTitles: chosen.becauseTitles,
      source: candidate.source,
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  const perAuthor = new Map<string, number>();
  const picked: BookRecommendation[] = [];
  for (const item of scored) {
    const key = authorKey(item.author) || item.id;
    const count = perAuthor.get(key) ?? 0;
    if (count >= MAX_PER_AUTHOR) continue;
    perAuthor.set(key, count + 1);
    const { score: _score, ...recommendation } = item;
    picked.push(recommendation);
    if (picked.length >= limit) break;
  }
  return picked;
}

export function libraryFingerprint(
  books: Array<{ isbn: string; title: string; author: string; seriesName?: string }>,
): string {
  const parts = books.map((book) => [
    canonicalIsbn(book.isbn) || (book.isbn.startsWith('photo-') || book.isbn.startsWith('wish-') ? book.isbn : ''),
    normalizeForMatching(book.title),
    authorKey(book.author),
    normalizeForMatching(book.seriesName ?? ''),
  ].join('|'));
  parts.sort();
  let hash = 5381;
  const value = parts.join('\n');
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return `v1:${(hash >>> 0).toString(16)}`;
}

export function authorSeeds(books: Array<{ author: string }>, limit = 3): string[] {
  const map = new Map<string, { name: string; count: number; index: number }>();
  books.forEach((book, index) => {
    const key = authorKey(book.author);
    if (isWeakAuthor(key)) return;
    const existing = map.get(key);
    if (existing) existing.count += 1;
    else map.set(key, { name: displayAuthor(book.author), count: 1, index });
  });
  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.name);
}

export function subjectSeeds(books: Array<{ subjects: string[] }>, limit = 3): string[] {
  const counts = new Map<string, { count: number; index: number }>();
  books.forEach((book, index) => {
    const seen = new Set<string>();
    for (const raw of book.subjects) {
      const key = normalizeSubject(raw);
      if (!isDistinctiveSubject(key) || seen.has(key)) continue;
      seen.add(key);
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { count: 1, index });
    }
  });
  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].index - b[1].index || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key]) => key);
}

export function seriesSeeds(
  books: Array<{ author: string; seriesName?: string }>,
  limit = 2,
): Array<{ series: string; author: string }> {
  const map = new Map<string, { series: string; author: string; count: number }>();
  for (const book of books) {
    const series = book.seriesName?.trim() ?? '';
    const key = normalizeForMatching(series);
    if (key.length < 3 || isWeakAuthor(authorKey(book.author))) continue;
    const existing = map.get(key);
    if (existing) existing.count += 1;
    else map.set(key, { series, author: displayAuthor(book.author), count: 1 });
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(({ series, author }) => ({ series, author }));
}

export function mentionsSeries(title: string, subjects: string[], series: string): boolean {
  const needle = normalizeForMatching(series);
  if (needle.length < 3) return false;
  const hay = `${normalizeForMatching(title)} ${subjects.map((subject) => normalizeSubject(subject)).join(' ')}`;
  return hay.includes(needle);
}

export function booksForSubjectLookup<T extends { id: string; isbn: string; author: string; dateAdded: string; isPhotoOnly?: boolean }>(
  books: T[],
  limit = 6,
): T[] {
  const eligible = books.filter((book) => !book.isPhotoOnly && canonicalIsbn(book.isbn));
  const recent = [...eligible].sort((a, b) => b.dateAdded.localeCompare(a.dateAdded));
  const picked: T[] = [];
  const seenAuthors = new Set<string>();
  for (const book of recent) {
    const key = authorKey(book.author) || book.id;
    if (seenAuthors.has(key)) continue;
    seenAuthors.add(key);
    picked.push(book);
    if (picked.length >= limit) return picked;
  }
  for (const book of recent) {
    if (picked.includes(book)) continue;
    picked.push(book);
    if (picked.length >= limit) break;
  }
  return picked;
}
