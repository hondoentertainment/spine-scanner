import { isbn10To13 } from '../utils/isbnValidation.ts';
import { normalizeForMatching } from '../utils/editionDuplicates.ts';
import type { BookRecommendation, CatalogCandidate, OwnedBookSignal, RecommendationShelf } from './types.ts';

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
  workKey?: string;
  alternateTitles?: string[];
  language?: string;
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

const GENERIC_SHELF_NAMES = new Set([
  'shelf', 'shelves', 'my shelf', 'bookshelf', 'bookcase', 'case', 'room',
  'books', 'my books', 'library', 'owned', 'wishlist', 'to read', 'reading',
  'read', 'favorites', 'favourite', 'favourites', 'all', 'misc', 'miscellaneous',
  'unassigned', 'living room', 'bedroom', 'office', 'hallway', 'kitchen', 'den',
  'study', 'lounge', 'home', 'default', 'general', 'other', 'unknown', 'new shelf',
  'want to read', 'currently reading', 'dnf', 'did not finish', 'unread', 'finished',
]);

/** Shelf labels readers use as genres, mapped onto Open Library subject phrases. */
const SHELF_SUBJECT_ALIASES: Record<string, string> = {
  'sci-fi': 'science fiction',
  'sci fi': 'science fiction',
  scifi: 'science fiction',
  sf: 'science fiction',
  'science fiction': 'science fiction',
  'science-fiction': 'science fiction',
  'speculative fiction': 'science fiction',
  fantasy: 'fantasy',
  'epic fantasy': 'fantasy',
  mystery: 'mystery',
  mysteries: 'mystery',
  crime: 'crime',
  thriller: 'thriller',
  thrillers: 'thriller',
  romance: 'romance',
  historical: 'history',
  history: 'history',
  biography: 'biography',
  biographies: 'biography',
  memoir: 'biography',
  poetry: 'poetry',
  poems: 'poetry',
  horror: 'horror',
  ya: 'young adult fiction',
  'young adult': 'young adult fiction',
  'graphic novels': 'graphic novels',
  'graphic novel': 'graphic novels',
  comics: 'comics',
  nonfiction: 'nonfiction',
  'non-fiction': 'nonfiction',
  'non fiction': 'nonfiction',
  philosophy: 'philosophy',
  classics: 'classics',
  'literary fiction': 'literary fiction',
  'space opera': 'space opera',
};

export function shelfNameKey(name: string): string {
  return normalizeSubject(name).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

function shelfAlias(name: string): string {
  const spaced = shelfNameKey(name);
  return SHELF_SUBJECT_ALIASES[spaced] ?? SHELF_SUBJECT_ALIASES[normalizeSubject(name)] ?? '';
}

/** A room called "Living Room" or "Shelf 2" is a place. "Sci-Fi" is a collection. */
export function isCollectionShelfName(name: string): boolean {
  const key = shelfNameKey(name);
  if (!key || GENERIC_SHELF_NAMES.has(key)) return false;
  if (shelfAlias(name)) return key.length >= 2;
  if (key.length < 3) return false;
  if (/^\d+$/.test(key)) return false;
  if (/^(shelf|case|row|bay|level)\s*[a-z0-9]+$/.test(key)) return false;
  return true;
}

/** Open Library subject for a collection shelf. Empty when the label is only a place. */
export function shelfSubjectQuery(name: string): string {
  if (!isCollectionShelfName(name)) return '';
  return shelfAlias(name) || shelfNameKey(name);
}

export function displayShelfName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

/** Wishlist placeholders are not copies on a shelf. Scanned and typed books are. */
export function countsTowardShelf(book: { isbn?: string | null }): boolean {
  return !(book.isbn ?? '').startsWith('wish-');
}

export function lendingCount(book: {
  loanLedger?: unknown[] | null;
  loan?: { borrowerName?: string | null } | null;
  lentTo?: string | null;
}): number {
  const ledger = Array.isArray(book.loanLedger) ? book.loanLedger.length : 0;
  if (ledger > 0) return ledger;
  if (book.loan?.borrowerName?.trim() || book.lentTo?.trim()) return 1;
  return 0;
}

export function collectionNamesForBook(
  book: { shelfIds?: string[]; locationShelf?: string | null; locationCase?: string | null },
  shelves: RecommendationShelf[],
): string[] {
  const byId = new Map(shelves.map((shelf) => [shelf.id, shelf.name]));
  const names: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | null | undefined) => {
    const display = displayShelfName(raw ?? '');
    if (!isCollectionShelfName(display)) return;
    const key = shelfNameKey(display);
    if (seen.has(key)) return;
    seen.add(key);
    names.push(display);
  };
  for (const id of book.shelfIds ?? []) push(byId.get(id));
  push(book.locationShelf);
  push(book.locationCase);
  return names;
}

export interface ShelfSeed {
  name: string;
  subject: string;
  count: number;
}

export function shelfSeeds(
  books: Array<{
    isbn?: string | null;
    shelfIds?: string[];
    locationShelf?: string | null;
    locationCase?: string | null;
    loanLedger?: unknown[] | null;
    loan?: { borrowerName?: string | null } | null;
    lentTo?: string | null;
  }>,
  shelves: RecommendationShelf[],
  limit = 3,
): ShelfSeed[] {
  const map = new Map<string, { name: string; subject: string; count: number; loans: number }>();
  for (const book of books) {
    if (!countsTowardShelf(book)) continue;
    const loans = lendingCount(book);
    for (const name of collectionNamesForBook(book, shelves)) {
      const subject = shelfSubjectQuery(name);
      if (!subject) continue;
      const key = shelfNameKey(name);
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.loans += loans;
      } else {
        map.set(key, { name: displayShelfName(name), subject, count: 1, loans });
      }
    }
  }
  return [...map.values()]
    .filter((entry) => entry.count >= 2)
    .sort((a, b) => (b.count * 2 + b.loans) - (a.count * 2 + a.loans) || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ name, subject, count }) => ({ name, subject, count }));
}

function uniqueTitles(titles: string[]): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const title of titles) {
    const trimmed = title.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  return unique;
}

function phraseForTitles(kind: 'own' | 'lent', titles: string[]): string {
  const unique = uniqueTitles(titles);
  if (unique.length === 0) return '';
  const verb = kind === 'own' ? 'Because you own' : "Because you've lent";
  if (unique.length === 1) return `${verb} ${unique[0]}`;
  if (unique.length === 2) return `${verb} ${unique[0]} and ${unique[1]}`;
  return `${verb} ${unique[0]}, ${unique[1]}, and ${unique.length - 2} more`;
}

export function becauseYouOwn(titles: string[]): string {
  return phraseForTitles('own', titles);
}

export function becauseYouLent(titles: string[]): string {
  return phraseForTitles('lent', titles);
}

export function becauseYouHaveAuthor(count: number, author: string): string {
  const name = displayAuthor(author);
  if (count < 2 || !name) return '';
  return `Because you have ${count} books by ${name}`;
}

export function moreFromShelf(name: string): string {
  const display = displayShelfName(name);
  if (!isCollectionShelfName(display)) return '';
  return `More from your ${display} shelf`;
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
  loanCount: number;
}

interface ShelfExplanation {
  reason: string;
  becauseTitles: string[];
  score: number;
}

function linksFor(candidate: CatalogCandidate, owned: OwnedBookSignal[]): ScoredLink[] {
  const candidateAuthor = authorKey(candidate.author);
  const candidateSeries = normalizeForMatching(candidate.seriesName ?? '');
  const candidateSubjects = subjectSet(candidate.subjects);
  const links: ScoredLink[] = [];

  owned.forEach((book, index) => {
    if (!countsTowardShelf(book)) return;
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
    const loanCount = book.loanCount ?? 0;
    if (weight > 0 && loanCount > 0) weight += Math.min(loanCount, 3);
    if (weight > 0) links.push({ title: book.title, weight, index, loanCount });
  });

  links.sort((a, b) => b.weight - a.weight || a.index - b.index);
  return links;
}

function closeLinks(links: ScoredLink[]): ScoredLink[] {
  if (links.length === 0) return [];
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
  return unique;
}

function titleReason(links: ScoredLink[]): ShelfExplanation | null {
  const unique = closeLinks(links);
  if (unique.length === 0) return null;
  const lent = unique.every((link) => link.loanCount > 0);
  const reason = phraseForTitles(lent ? 'lent' : 'own', unique.map((link) => link.title));
  if (!reason) return null;
  return {
    reason,
    becauseTitles: unique.slice(0, 2).map((link) => link.title),
    score: links.reduce((sum, link) => sum + link.weight, 0),
  };
}

function authorCopies(candidate: CatalogCandidate, owned: OwnedBookSignal[]): OwnedBookSignal[] {
  const key = authorKey(candidate.author);
  if (isWeakAuthor(key)) return [];
  return owned.filter((book) => countsTowardShelf(book) && authorKey(book.author) === key);
}

function titlesOnShelf(owned: OwnedBookSignal[], shelfKey: string): string[] {
  return uniqueTitles(owned
    .filter((book) => (
      countsTowardShelf(book)
      && (book.shelfNames ?? []).some((name) => shelfNameKey(name) === shelfKey)
    ))
    .map((book) => book.title));
}

function shelfReason(
  candidate: CatalogCandidate,
  owned: OwnedBookSignal[],
  links: ScoredLink[],
): { name: string; titles: string[] } | null {
  if (candidate.fromShelf && isCollectionShelfName(candidate.fromShelf)) {
    const titles = titlesOnShelf(owned, shelfNameKey(candidate.fromShelf));
    if (titles.length >= 2) return { name: displayShelfName(candidate.fromShelf), titles };
  }

  const tally = new Map<string, { name: string; titles: string[] }>();
  for (const link of links) {
    const book = owned[link.index];
    if (!book) continue;
    for (const name of book.shelfNames ?? []) {
      if (!isCollectionShelfName(name)) continue;
      const key = shelfNameKey(name);
      const entry = tally.get(key) ?? { name: displayShelfName(name), titles: [] };
      const title = book.title.trim();
      if (title && !entry.titles.some((existing) => existing.toLowerCase() === title.toLowerCase())) {
        entry.titles.push(title);
      }
      tally.set(key, entry);
    }
  }
  const ranked = [...tally.values()]
    .filter((entry) => entry.titles.length >= 2)
    .sort((a, b) => b.titles.length - a.titles.length || a.name.localeCompare(b.name));
  return ranked[0] ?? null;
}

function explainCandidate(
  candidate: CatalogCandidate,
  owned: OwnedBookSignal[],
  links: ScoredLink[],
): ShelfExplanation | null {
  const fromTitles = titleReason(links);
  const authors = authorCopies(candidate, owned);
  if (authors.length >= 2) {
    const reason = becauseYouHaveAuthor(authors.length, authors[0].author);
    const becauseTitles = uniqueTitles(authors.map((book) => book.title));
    if (reason && becauseTitles.length > 0) {
      return {
        reason,
        becauseTitles,
        score: (fromTitles?.score ?? AUTHOR_MATCH_WEIGHT) + authors.length,
      };
    }
  }

  const shelf = shelfReason(candidate, owned, links);
  if (shelf) {
    const reason = moreFromShelf(shelf.name);
    if (reason) {
      return {
        reason,
        becauseTitles: shelf.titles,
        score: Math.max(fromTitles?.score ?? 0, SUBJECT_MATCH_WEIGHT * Math.min(shelf.titles.length, 4)),
      };
    }
  }

  return fromTitles;
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const WORD_BY_NUMBER = Object.fromEntries(
  Object.entries(NUMBER_WORDS).map(([word, value]) => [value, word]),
) as Record<number, string>;

const STUDY_MARKERS = [
  'study guide', 'sparknotes', 'spark notes', 'cliffsnotes', 'cliff notes', 'cliffs notes',
  'summary and analysis', 'chapter summary', 'book summary', 'study notes', 'workbook',
  'notes on', 'companion to', 'reader guide', 'reading guide',
];

const COLLECTION_MARKERS = [
  'omnibus', 'collection', 'complete novels', 'complete works', 'complete series',
  'boxed set', 'box set', 'anthology', 'and other stories', 'and other novels',
];

const SEQUEL_HINTS = new Set([
  'messiah', 'empire', 'returns', 'reborn', 'rising', 'awakens',
  'part', 'volume', 'vol', 'book', 'ii', 'iii', 'iv',
]);

const LANGUAGE_ALIASES: Record<string, string> = {
  eng: 'en', en: 'en', english: 'en',
  fre: 'fr', fra: 'fr', fr: 'fr', french: 'fr',
  ger: 'de', deu: 'de', de: 'de', german: 'de',
  spa: 'es', es: 'es', spanish: 'es',
  ita: 'it', it: 'it', italian: 'it',
  por: 'pt', pt: 'pt', portuguese: 'pt',
  rus: 'ru', ru: 'ru', russian: 'ru',
  jpn: 'ja', ja: 'ja', japanese: 'ja',
  zho: 'zh', chi: 'zh', zh: 'zh', chinese: 'zh',
  kor: 'ko', ko: 'ko', korean: 'ko',
  nld: 'nl', dut: 'nl', nl: 'nl', dutch: 'nl',
  swe: 'sv', sv: 'sv', swedish: 'sv',
  pol: 'pl', pl: 'pl', polish: 'pl',
  lat: 'la', la: 'la', latin: 'la',
};

export function normalizeWorkKey(raw: string | undefined | null): string {
  if (!raw) return '';
  const match = raw.match(/OL\d+W/i);
  return match ? match[0].toUpperCase() : '';
}

export function normalizeLanguage(raw: string | undefined | null): string {
  if (!raw) return '';
  const key = raw.trim().toLowerCase();
  if (!key) return '';
  return LANGUAGE_ALIASES[key] ?? (key.length <= 3 ? key : '');
}

export function readerLanguageTag(language?: string): string {
  const raw = language ?? (typeof navigator !== 'undefined' ? navigator.language : 'en');
  return normalizeLanguage(raw) || 'en';
}

/** Unknown language stays. A foreign edition of a suggestion is dropped. */
export function matchesReaderLanguage(language: string | undefined | null, reader?: string): boolean {
  const normalized = normalizeLanguage(language);
  if (!normalized) return true;
  return normalized === readerLanguageTag(reader);
}

function numberToWords(value: number): string {
  if (WORD_BY_NUMBER[value]) return WORD_BY_NUMBER[value];
  if (value < 100) {
    const ten = Math.floor(value / 10) * 10;
    const one = value % 10;
    const tenWord = WORD_BY_NUMBER[ten] ?? '';
    const oneWord = WORD_BY_NUMBER[one] ?? '';
    return [tenWord, oneWord].filter(Boolean).join(' ');
  }
  return String(value);
}

function parseNumberWords(words: string[]): { value: number; consumed: number } | null {
  if (words.length === 0 || !(words[0] in NUMBER_WORDS)) return null;
  const first = NUMBER_WORDS[words[0]];
  const second = words.length >= 2 ? NUMBER_WORDS[words[1]] : undefined;
  const third = words.length >= 3 ? NUMBER_WORDS[words[2]] : undefined;
  if (
    first >= 10 && first <= 20 && second != null && second >= 20 && second % 10 === 0
    && third != null && third < 10
  ) {
    return { value: first * 100 + second + third, consumed: 3 };
  }
  if (first >= 10 && first <= 20 && second != null && second >= 10 && second < 100 && second % 10 === 0) {
    return { value: first * 100 + second, consumed: 2 };
  }
  if (first >= 20 && first % 10 === 0 && second != null && second < 10) {
    return { value: first + second, consumed: 2 };
  }
  if (first >= 10) return { value: first, consumed: 1 };
  return null;
}

function foldNumberWords(normalized: string): string {
  const tokens = normalized.split(' ').filter(Boolean);
  const out: string[] = [];
  let index = 0;
  while (index < tokens.length) {
    const parsed = parseNumberWords(tokens.slice(index));
    if (parsed) {
      out.push(String(parsed.value));
      index += parsed.consumed;
    } else {
      out.push(tokens[index]);
      index += 1;
    }
  }
  return out.join(' ');
}

function expandYearDigits(normalized: string): string {
  return normalized.replace(/\b(\d{3,4})\b/g, (digits) => {
    const value = Number(digits);
    if (value < 1000 || value > 2099) return digits;
    const century = Math.floor(value / 100);
    const rest = value % 100;
    if (rest === 0) return `${numberToWords(century)} hundred`;
    return `${numberToWords(century)} ${numberToWords(rest)}`;
  });
}

function titleForms(title: string, alternates: string[] = []): Set<string> {
  const forms = new Set<string>();
  for (const raw of [title, ...alternates]) {
    const normalized = normalizeForMatching(raw);
    if (normalized.length < 2) continue;
    forms.add(normalized);
    const folded = foldNumberWords(normalized);
    if (folded) forms.add(folded);
    const expanded = expandYearDigits(folded);
    if (expanded) forms.add(expanded);
    const expandedFirst = expandYearDigits(normalized);
    if (expandedFirst) forms.add(foldNumberWords(expandedFirst));
  }
  return forms;
}

function phraseIncludes(haystack: string, needle: string): boolean {
  if (needle.length < 2) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

function formsOverlap(left: Set<string>, right: Set<string>): boolean {
  for (const form of left) {
    if (right.has(form)) return true;
  }
  return false;
}

function containsOwnedTitle(candidateTitle: string, ownedTitle: string, alternates: string[] = []): boolean {
  const haystack = normalizeForMatching(candidateTitle);
  if (!haystack) return false;
  for (const form of titleForms(ownedTitle, alternates)) {
    if (phraseIncludes(haystack, form) && haystack !== form) return true;
  }
  return false;
}

function isStudyGuideAbout(candidateTitle: string, ownedTitle: string, alternates: string[] = []): boolean {
  const haystack = normalizeForMatching(candidateTitle);
  if (!STUDY_MARKERS.some((marker) => haystack.includes(marker))) return false;
  return containsOwnedTitle(candidateTitle, ownedTitle, alternates)
    || [...titleForms(ownedTitle, alternates)].some((form) => phraseIncludes(haystack, form));
}

function collectionSegments(candidateTitle: string): string[] {
  const parts = candidateTitle
    .split(/\s*(?:,|&|\/|\band\b)\s*/i)
    .map((part) => normalizeForMatching(part))
    .filter((part) => part.length >= 2);
  if (parts.length >= 2) return parts;
  return normalizeForMatching(candidateTitle)
    .split(/\s+and\s+|\s+&\s+|\s+\/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isCollectionContaining(candidateTitle: string, ownedTitle: string, alternates: string[] = []): boolean {
  if (!containsOwnedTitle(candidateTitle, ownedTitle, alternates)) return false;
  const haystack = normalizeForMatching(candidateTitle);
  const raw = candidateTitle.toLowerCase();
  if (
    COLLECTION_MARKERS.some((marker) => haystack.includes(marker))
    || raw.includes('/')
    || raw.includes('omnibus')
  ) return true;
  const segments = collectionSegments(candidateTitle);
  if (segments.length < 2) return false;
  const owned = titleForms(ownedTitle, alternates);
  const matched = segments.some((segment) => owned.has(segment) || [...owned].some((form) => segment === form));
  if (!matched) return false;
  const remainder = segments.filter((segment) => !owned.has(segment));
  if (remainder.some((segment) => SEQUEL_HINTS.has(segment))) return false;
  return remainder.length > 0;
}

export function isAlreadyInLibrary(
  item: { title: string; author: string; isbn?: string; isbns?: string[]; workKey?: string; alternateTitles?: string[] },
  library: IdentityBook[],
): boolean {
  const wanted = new Set<string>();
  for (const raw of [item.isbn, ...(item.isbns ?? [])]) {
    const canonical = canonicalIsbn(raw);
    if (canonical) wanted.add(canonical);
  }
  const edition = editionKey(item.title, item.author);
  const itemKey = normalizeWorkKey(item.workKey);
  const itemForms = titleForms(item.title, item.alternateTitles ?? []);
  const itemAuthor = authorKey(item.author);
  for (const book of library) {
    const ownedIsbn = canonicalIsbn(book.isbn);
    if (ownedIsbn && wanted.has(ownedIsbn)) return true;
    if (edition && editionKey(book.title, book.author) === edition) return true;
    const ownedKey = normalizeWorkKey(book.workKey);
    if (itemKey && ownedKey && itemKey === ownedKey) return true;
    const ownedAuthor = authorKey(book.author);
    const sameAuthor = Boolean(itemAuthor && ownedAuthor && itemAuthor === ownedAuthor && !isWeakAuthor(itemAuthor));
    if (sameAuthor && formsOverlap(itemForms, titleForms(book.title, book.alternateTitles ?? []))) return true;
    if (isStudyGuideAbout(item.title, book.title, book.alternateTitles)) return true;
    if (isCollectionContaining(item.title, book.title, book.alternateTitles)) return true;
  }
  return false;
}

export function libraryHasTitle(library: Array<{ title: string }>, title: string): boolean {
  return library.some((book) => titlesMatch(book.title, title));
}

export function filterStillRelevant(
  recommendations: BookRecommendation[],
  library: IdentityBook[],
  readerLanguage?: string,
): BookRecommendation[] {
  return recommendations.filter((recommendation) => {
    if (!matchesReaderLanguage(recommendation.language, readerLanguage)) return false;
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
    const alternateTitles = [...(previous.alternateTitles ?? [])];
    for (const title of candidate.alternateTitles ?? []) {
      if (!alternateTitles.some((existing) => existing.toLowerCase() === title.toLowerCase())) {
        alternateTitles.push(title);
      }
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
      fromShelf: previous.fromShelf || candidate.fromShelf,
      workKey: previous.workKey || candidate.workKey,
      language: previous.language || candidate.language,
      alternateTitles,
    });
  }
  return [...merged.values()];
}

export function rankRecommendations(
  candidates: CatalogCandidate[],
  owned: OwnedBookSignal[],
  limit = RECOMMENDATION_LIMIT,
  readerLanguage?: string,
): BookRecommendation[] {
  const ownedTitles = owned.map((book) => book.title);
  const scored: Array<BookRecommendation & { score: number }> = [];

  for (const candidate of mergeCandidates(candidates)) {
    if (!matchesReaderLanguage(candidate.language, readerLanguage)) continue;
    if (isAlreadyInLibrary(candidate, owned)) continue;
    const links = linksFor(candidate, owned);
    const algorithmic = explainCandidate(candidate, owned, links);
    const external = candidate.reason ? acceptShelfReason(candidate.reason, ownedTitles) : null;
    const shelfLed = Boolean(
      algorithmic
      && (algorithmic.reason.startsWith('Because you have ') || algorithmic.reason.startsWith('More from your ')),
    );
    const chosen = shelfLed ? algorithmic : (external ?? algorithmic);
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
      workKey: normalizeWorkKey(candidate.workKey) || undefined,
      language: normalizeLanguage(candidate.language) || undefined,
      alternateTitles: candidate.alternateTitles,
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
  books: Array<{
    isbn: string;
    title: string;
    author: string;
    seriesName?: string;
    shelfIds?: string[];
    locationCase?: string | null;
    locationShelf?: string | null;
    loanLedger?: unknown[] | null;
    loan?: { borrowerName?: string | null } | null;
    lentTo?: string | null;
  }>,
  shelves: RecommendationShelf[] = [],
): string {
  const parts = books.map((book) => [
    canonicalIsbn(book.isbn) || (book.isbn.startsWith('photo-') || book.isbn.startsWith('wish-') ? book.isbn : ''),
    normalizeForMatching(book.title),
    authorKey(book.author),
    normalizeForMatching(book.seriesName ?? ''),
    [...(book.shelfIds ?? [])].sort().join(','),
    shelfNameKey(book.locationCase ?? ''),
    shelfNameKey(book.locationShelf ?? ''),
    String(lendingCount(book)),
  ].join('|'));
  parts.sort();
  const shelfPart = shelves
    .map((shelf) => `${shelf.id}:${shelfNameKey(shelf.name)}`)
    .sort()
    .join(',');
  let hash = 5381;
  const value = `${parts.join('\n')}\n#${shelfPart}`;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return `v2:${(hash >>> 0).toString(16)}`;
}

export function authorSeeds(
  books: Array<{
    author: string;
    isbn?: string | null;
    loanLedger?: unknown[] | null;
    loan?: { borrowerName?: string | null } | null;
    lentTo?: string | null;
  }>,
  limit = 3,
): string[] {
  const map = new Map<string, { name: string; count: number; loans: number; index: number }>();
  books.forEach((book, index) => {
    if (!countsTowardShelf(book)) return;
    const key = authorKey(book.author);
    if (isWeakAuthor(key)) return;
    const existing = map.get(key);
    const loans = lendingCount(book);
    if (existing) {
      existing.count += 1;
      existing.loans += loans;
    } else {
      map.set(key, { name: displayAuthor(book.author), count: 1, loans, index });
    }
  });
  return [...map.values()]
    .sort((a, b) => (b.count * 2 + b.loans) - (a.count * 2 + a.loans) || b.count - a.count || a.index - b.index)
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
  books: Array<{ author: string; seriesName?: string; isbn?: string | null }>,
  limit = 2,
): Array<{ series: string; author: string }> {
  const map = new Map<string, { series: string; author: string; count: number }>();
  for (const book of books) {
    if (!countsTowardShelf(book)) continue;
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
