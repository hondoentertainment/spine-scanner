import type { BookEntry } from '../types.ts';

export interface DuplicateGroup {
  reason: 'same_isbn' | 'similar_title' | 'same_author_similar_title';
  books: BookEntry[];
  confidence: number; // 0-1
}

/** Find potential duplicate books in the library */
export function findDuplicates(books: BookEntry[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const usedIds = new Set<string>();

  // 1. Same ISBN (highest confidence)
  const isbnMap = new Map<string, BookEntry[]>();
  for (const book of books) {
    const isbn = book.isbn.trim();
    if (!isbn || isbn.startsWith('photo-')) continue;
    const existing = isbnMap.get(isbn);
    if (existing) {
      existing.push(book);
    } else {
      isbnMap.set(isbn, [book]);
    }
  }
  for (const [, group] of isbnMap) {
    if (group.length > 1) {
      groups.push({ reason: 'same_isbn', books: group, confidence: 1 });
      for (const b of group) usedIds.add(b.id);
    }
  }

  // 2. Same author + similar title
  const remaining = books.filter((b) => !usedIds.has(b.id));
  for (let i = 0; i < remaining.length; i++) {
    for (let j = i + 1; j < remaining.length; j++) {
      const a = remaining[i];
      const b = remaining[j];

      const titleSim = stringSimilarity(normalizeTitle(a.title), normalizeTitle(b.title));
      const sameAuthor =
        a.author.trim().toLowerCase() === b.author.trim().toLowerCase() &&
        a.author.trim() !== '';

      if (sameAuthor && titleSim >= 0.7) {
        // Check if either is already in a group
        const existingGroup = groups.find(
          (g) =>
            g.reason === 'same_author_similar_title' &&
            (g.books.some((gb) => gb.id === a.id) || g.books.some((gb) => gb.id === b.id)),
        );
        if (existingGroup) {
          if (!existingGroup.books.some((gb) => gb.id === a.id)) existingGroup.books.push(a);
          if (!existingGroup.books.some((gb) => gb.id === b.id)) existingGroup.books.push(b);
          existingGroup.confidence = Math.max(existingGroup.confidence, titleSim * 0.9);
        } else {
          groups.push({
            reason: 'same_author_similar_title',
            books: [a, b],
            confidence: Math.round(titleSim * 0.9 * 100) / 100,
          });
        }
        usedIds.add(a.id);
        usedIds.add(b.id);
      } else if (!sameAuthor && titleSim >= 0.9) {
        // Very similar titles even with different authors
        const existingGroup = groups.find(
          (g) =>
            g.reason === 'similar_title' &&
            (g.books.some((gb) => gb.id === a.id) || g.books.some((gb) => gb.id === b.id)),
        );
        if (existingGroup) {
          if (!existingGroup.books.some((gb) => gb.id === a.id)) existingGroup.books.push(a);
          if (!existingGroup.books.some((gb) => gb.id === b.id)) existingGroup.books.push(b);
          existingGroup.confidence = Math.max(existingGroup.confidence, titleSim * 0.7);
        } else {
          groups.push({
            reason: 'similar_title',
            books: [a, b],
            confidence: Math.round(titleSim * 0.7 * 100) / 100,
          });
        }
        usedIds.add(a.id);
        usedIds.add(b.id);
      }
    }
  }

  return groups.sort((a, b) => b.confidence - a.confidence);
}

/** Simple string similarity (Levenshtein-based, returns 0-1) */
export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return Math.round((1 - distance / maxLen) * 100) / 100;
}

/** Normalize title for comparison (lowercase, remove articles, trim) */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[m][n];
}
