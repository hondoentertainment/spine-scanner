import type { BookEntry } from '../types.ts';

export interface LibraryInsightsAdvanced {
  // Reading patterns
  favoriteAuthors: Array<{ author: string; count: number }>;
  averageBookLength: number;
  shortestBook: BookEntry | null;
  longestBook: BookEntry | null;

  // Backlog analysis
  unreadBacklogSize: number;
  unreadBacklogPages: number;
  estimatedReadingTime: string;
  oldestUnread: BookEntry | null;

  // Completion insights
  completionRate: number;
  dnfRate: number;
  averageRating: number;

  // Recommendations based on owned books
  suggestedNextReads: BookEntry[];

  // Fun facts
  funFacts: string[];
}

export function generateAdvancedInsights(books: BookEntry[]): LibraryInsightsAdvanced {
  const favoriteAuthors = getTopAuthors(books);
  const booksWithPages = books.filter((b) => b.pageCount > 0);
  const averageBookLength =
    booksWithPages.length > 0
      ? Math.round(booksWithPages.reduce((sum, b) => sum + b.pageCount, 0) / booksWithPages.length)
      : 0;

  const sortedByPages = [...booksWithPages].sort((a, b) => a.pageCount - b.pageCount);
  const shortestBook = sortedByPages[0] ?? null;
  const longestBook = sortedByPages[sortedByPages.length - 1] ?? null;

  const unread = books.filter((b) => b.status === 'to-read');
  const unreadBacklogSize = unread.length;
  const unreadBacklogPages = unread.reduce((sum, b) => sum + (b.pageCount || 0), 0);
  const estimatedReadingTime = estimateBacklogTime(books, unreadBacklogPages);
  const oldestUnread =
    [...unread].sort((a, b) => Date.parse(a.dateAdded) - Date.parse(b.dateAdded))[0] ?? null;

  const total = books.length;
  const readCount = books.filter((b) => b.status === 'read').length;
  const dnfCount = books.filter((b) => b.status === 'dnf').length;
  const completionRate = total > 0 ? Math.round((readCount / total) * 100) : 0;
  const dnfRate = total > 0 ? Math.round((dnfCount / total) * 100) : 0;

  const ratedBooks = books.filter((b) => b.rating != null && b.rating > 0);
  const averageRating =
    ratedBooks.length > 0
      ? Math.round((ratedBooks.reduce((sum, b) => sum + b.rating!, 0) / ratedBooks.length) * 10) / 10
      : 0;

  const suggestedNextReads = suggestNextReads(books);
  const funFacts = generateFunFacts(books);

  return {
    favoriteAuthors,
    averageBookLength,
    shortestBook,
    longestBook,
    unreadBacklogSize,
    unreadBacklogPages,
    estimatedReadingTime,
    oldestUnread,
    completionRate,
    dnfRate,
    averageRating,
    suggestedNextReads,
    funFacts,
  };
}

/** Get top N authors by book count */
export function getTopAuthors(
  books: BookEntry[],
  limit: number = 5,
): Array<{ author: string; count: number }> {
  const counts = new Map<string, number>();
  for (const book of books) {
    const author = book.author.trim();
    if (!author) continue;
    counts.set(author, (counts.get(author) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([author, count]) => ({ author, count }))
    .sort((a, b) => b.count - a.count || a.author.localeCompare(b.author))
    .slice(0, limit);
}

/** Suggest next reads based on patterns */
export function suggestNextReads(books: BookEntry[], limit: number = 5): BookEntry[] {
  const unread = books.filter((b) => b.status === 'to-read');
  if (unread.length === 0) return [];

  const topAuthors = new Set(getTopAuthors(books, 10).map((a) => a.author));

  const scored = unread.map((book) => {
    let score = 0;
    // Prefer books by favorite authors
    if (topAuthors.has(book.author.trim())) score += 3;
    // Prefer shorter books (quicker wins)
    if (book.pageCount > 0 && book.pageCount <= 300) score += 2;
    else if (book.pageCount > 0 && book.pageCount <= 500) score += 1;
    // Prefer books added longer ago (reduce backlog)
    const ageMs = Date.now() - Date.parse(book.dateAdded);
    if (ageMs > 180 * 24 * 60 * 60 * 1000) score += 1; // > 6 months old
    return { book, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.book);
}

/** Generate fun facts about the library */
export function generateFunFacts(books: BookEntry[]): string[] {
  const facts: string[] = [];
  if (books.length === 0) return facts;

  const totalPages = books.reduce((sum, b) => sum + (b.pageCount || 0), 0);
  const readPages = books
    .filter((b) => b.status === 'read')
    .reduce((sum, b) => sum + (b.pageCount || 0), 0);

  // War and Peace comparison (~1,225 pages)
  if (readPages > 0) {
    const warAndPeaceCopies = Math.round((readPages / 1225) * 10) / 10;
    if (warAndPeaceCopies >= 0.5) {
      facts.push(
        `You've read enough pages to fill ${warAndPeaceCopies} ${warAndPeaceCopies === 1 ? 'copy' : 'copies'} of War and Peace`,
      );
    }
  }

  // Favorite author
  const topAuthors = getTopAuthors(books, 1);
  if (topAuthors.length > 0 && topAuthors[0].count > 1) {
    facts.push(
      `Your most collected author is ${topAuthors[0].author} with ${topAuthors[0].count} books`,
    );
  }

  // Longest book
  const booksWithPages = books.filter((b) => b.pageCount > 0);
  if (booksWithPages.length > 0) {
    const longest = [...booksWithPages].sort((a, b) => b.pageCount - a.pageCount)[0];
    facts.push(`Your longest book is "${longest.title}" at ${longest.pageCount.toLocaleString()} pages`);
  }

  // Total pages
  if (totalPages > 0) {
    facts.push(`Your library contains ${totalPages.toLocaleString()} total pages`);
  }

  // Unique authors
  const uniqueAuthors = new Set(books.map((b) => b.author.trim()).filter(Boolean));
  if (uniqueAuthors.size > 1) {
    facts.push(`You have books from ${uniqueAuthors.size} different authors`);
  }

  // Average rating
  const ratedBooks = books.filter((b) => b.rating != null && b.rating > 0);
  if (ratedBooks.length >= 3) {
    const avg = Math.round((ratedBooks.reduce((sum, b) => sum + b.rating!, 0) / ratedBooks.length) * 10) / 10;
    facts.push(`Your average book rating is ${avg} out of 5 stars`);
  }

  return facts;
}

/** Estimate how long it would take to read the backlog based on reading pace */
function estimateBacklogTime(books: BookEntry[], backlogPages: number): string {
  if (backlogPages === 0) return 'Backlog clear!';

  // Calculate reading pace from finished books
  const finishedBooks = books.filter(
    (b) => b.status === 'read' && b.finishedReading && b.startedReading,
  );

  if (finishedBooks.length >= 2) {
    // Use actual reading pace
    let totalDays = 0;
    let totalPagesRead = 0;
    for (const book of finishedBooks) {
      const start = Date.parse(book.startedReading!);
      const end = Date.parse(book.finishedReading!);
      const days = Math.max((end - start) / (1000 * 60 * 60 * 24), 1);
      totalDays += days;
      totalPagesRead += book.pageCount || 0;
    }
    if (totalPagesRead > 0 && totalDays > 0) {
      const pagesPerDay = totalPagesRead / totalDays;
      const daysNeeded = Math.ceil(backlogPages / pagesPerDay);
      return formatDuration(daysNeeded);
    }
  }

  // Fallback: assume ~30 pages/day
  const daysNeeded = Math.ceil(backlogPages / 30);
  return `~${formatDuration(daysNeeded)} at 30 pages/day`;
}

function formatDuration(days: number): string {
  if (days < 7) return `~${days} day${days !== 1 ? 's' : ''}`;
  if (days < 30) {
    const weeks = Math.round(days / 7);
    return `~${weeks} week${weeks !== 1 ? 's' : ''}`;
  }
  if (days < 365) {
    const months = Math.round(days / 30);
    return `~${months} month${months !== 1 ? 's' : ''}`;
  }
  const years = Math.round((days / 365) * 10) / 10;
  return `~${years} year${years !== 1 ? 's' : ''}`;
}
