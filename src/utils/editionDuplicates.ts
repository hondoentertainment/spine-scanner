import type { BookEntry } from '../types.ts';
import { normalizeToIsbn13 } from './isbnValidation.ts';
import { isBookPhotoOnly } from './libraryUtils.ts';

export interface EditionDuplicateGroup {
  /** Normalized "title|author" key for the group. */
  key: string;
  /** 2+ entries with matching normalized title+author but DIFFERENT ISBNs. */
  books: BookEntry[];
}

/**
 * Common edition / format suffixes stripped from titles before fuzzy matching.
 * Order matters: longer phrases first so they remove cleanly before shorter ones.
 */
const EDITION_SUFFIX_TOKENS = [
  'anniversary edition',
  'collectors edition',
  'collector edition',
  'special edition',
  'deluxe edition',
  'illustrated edition',
  'expanded edition',
  'extended edition',
  'revised edition',
  'updated edition',
  'second edition',
  'third edition',
  'fourth edition',
  'fifth edition',
  'first edition',
  'new edition',
  'us edition',
  'uk edition',
  'reissue edition',
  'reprint edition',
  'unabridged',
  'abridged',
  'paperback',
  'hardcover',
  'hardback',
  'mass market',
  'kindle edition',
  'ebook',
  'audiobook',
  'edition',
];

/**
 * Normalize a string for fuzzy matching: lowercase, strip diacritics,
 * remove parenthetical/bracketed edition descriptors, drop common edition
 * suffixes (e.g. "(unabridged)", "[paperback]", ": revised edition"),
 * remove punctuation, and collapse whitespace.
 */
export function normalizeForMatching(s: string): string {
  if (!s) return '';
  let out = s.normalize('NFD').replace(/\p{M}/gu, '');
  out = out.toLowerCase();

  // Strip parenthetical / bracketed descriptors entirely (edition info, format, etc.).
  out = out.replace(/\([^)]*\)/g, ' ');
  out = out.replace(/\[[^\]]*\]/g, ' ');
  out = out.replace(/\{[^}]*\}/g, ' ');

  // Drop subtitle separators and replace punctuation with spaces.
  out = out.replace(/[:,;\-–—_/\\.!?'"`]/g, ' ');
  out = out.replace(/[^a-z0-9\s]/g, ' ');
  out = out.replace(/\s+/g, ' ').trim();

  // Iteratively strip trailing edition tokens until none remain.
  let changed = true;
  while (changed) {
    changed = false;
    for (const token of EDITION_SUFFIX_TOKENS) {
      if (out === token) {
        out = '';
        changed = true;
        break;
      }
      const suffix = ' ' + token;
      if (out.endsWith(suffix)) {
        out = out.slice(0, -suffix.length).trim();
        changed = true;
        break;
      }
    }
  }

  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Find groups of 2+ books with matching normalized title+author but
 * different canonical ISBN-13s. Books with the same exact ISBN are NOT
 * included (those are already handled by findDuplicateIsbnGroups).
 * Photo-only books are excluded.
 */
export function findEditionDuplicateGroups(
  books: BookEntry[],
): EditionDuplicateGroup[] {
  const map = new Map<string, BookEntry[]>();
  for (const book of books) {
    if (isBookPhotoOnly(book)) continue;
    const title = normalizeForMatching(book.title);
    const author = normalizeForMatching(book.author);
    if (!title || !author) continue;
    const key = `${title}|${author}`;
    const list = map.get(key);
    if (list) list.push(book);
    else map.set(key, [book]);
  }

  const groups: EditionDuplicateGroup[] = [];
  for (const [key, list] of map) {
    if (list.length < 2) continue;
    // Require at least two distinct canonical ISBNs in the group;
    // exact-ISBN duplicates are handled separately.
    const canonicalIsbns = new Set(list.map((b) => normalizeToIsbn13(b.isbn)));
    if (canonicalIsbns.size < 2) continue;
    groups.push({ key, books: list });
  }
  return groups;
}
