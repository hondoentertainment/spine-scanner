import type { BookEntry } from '../types.ts';

export interface ReadingStats {
  booksReadThisYear: number;
  booksReadLastYear: number;
  yearlyGoalProgress: number;
  averagePagesPerBook: number;
  totalPagesRead: number;
  currentStreak: number;
  longestStreak: number;
  averageRating: number;
  ratingDistribution: Record<number, number>;
  monthlyReading: Array<{ month: string; count: number }>;
  fastestRead: BookEntry | null;
  mostPagesRead: BookEntry | null;
}

/**
 * Calculate comprehensive reading statistics from a book collection.
 */
export function calculateReadingStats(books: BookEntry[], yearlyGoal?: number): ReadingStats {
  const now = new Date();
  const thisYear = now.getFullYear();
  const lastYear = thisYear - 1;

  const readBooks = books.filter((b) => b.status === 'read');

  // Books read this year / last year (by finishedReading date)
  const booksReadThisYear = readBooks.filter((b) => {
    if (!b.finishedReading) return false;
    return new Date(b.finishedReading).getFullYear() === thisYear;
  }).length;

  const booksReadLastYear = readBooks.filter((b) => {
    if (!b.finishedReading) return false;
    return new Date(b.finishedReading).getFullYear() === lastYear;
  }).length;

  const yearlyGoalProgress = yearlyGoal && yearlyGoal > 0
    ? Math.min(Math.round((booksReadThisYear / yearlyGoal) * 100), 100)
    : 0;

  // Pages
  const totalPagesRead = readBooks.reduce((sum, b) => sum + (b.pageCount || 0), 0);
  const averagePagesPerBook = readBooks.length > 0
    ? Math.round(totalPagesRead / readBooks.length)
    : 0;

  // Streaks
  const { current: currentStreak, longest: longestStreak } = getReadingStreak(books);

  // Ratings
  const ratedBooks = books.filter((b) => b.rating != null && b.rating >= 1 && b.rating <= 5);
  const averageRating = ratedBooks.length > 0
    ? Math.round((ratedBooks.reduce((sum, b) => sum + b.rating!, 0) / ratedBooks.length) * 10) / 10
    : 0;

  const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const b of ratedBooks) {
    ratingDistribution[b.rating!] = (ratingDistribution[b.rating!] || 0) + 1;
  }

  // Monthly reading
  const monthlyReading = getMonthlyReadingCounts(books);

  // Fastest read (shortest time between startedReading and finishedReading)
  let fastestRead: BookEntry | null = null;
  let fastestDays = Infinity;
  for (const b of readBooks) {
    if (b.startedReading && b.finishedReading) {
      const start = new Date(b.startedReading).getTime();
      const end = new Date(b.finishedReading).getTime();
      const days = (end - start) / (1000 * 60 * 60 * 24);
      if (days >= 0 && days < fastestDays) {
        fastestDays = days;
        fastestRead = b;
      }
    }
  }

  // Most pages read (book with highest pageCount among read books)
  let mostPagesRead: BookEntry | null = null;
  let maxPages = 0;
  for (const b of readBooks) {
    if ((b.pageCount || 0) > maxPages) {
      maxPages = b.pageCount || 0;
      mostPagesRead = b;
    }
  }

  return {
    booksReadThisYear,
    booksReadLastYear,
    yearlyGoalProgress,
    averagePagesPerBook,
    totalPagesRead,
    currentStreak,
    longestStreak,
    averageRating,
    ratingDistribution,
    monthlyReading,
    fastestRead,
    mostPagesRead,
  };
}

/**
 * Calculate reading streak based on finishedReading dates.
 * A streak counts consecutive days where at least one book was finished.
 */
export function getReadingStreak(books: BookEntry[]): { current: number; longest: number } {
  const finishedDates = books
    .filter((b) => b.status === 'read' && b.finishedReading)
    .map((b) => {
      const d = new Date(b.finishedReading!);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    });

  if (finishedDates.length === 0) return { current: 0, longest: 0 };

  // Deduplicate and sort descending
  const uniqueDays = [...new Set(finishedDates)].sort((a, b) => b - a);
  const oneDay = 24 * 60 * 60 * 1000;

  // Calculate current streak (from today backwards)
  const today = new Date();
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  let currentStreak = 0;
  let checkDay = todayMs;

  for (const day of uniqueDays) {
    if (day === checkDay) {
      currentStreak++;
      checkDay -= oneDay;
    } else if (day < checkDay) {
      // If the first day isn't today, check if it's yesterday (streak still valid)
      if (currentStreak === 0 && day === todayMs - oneDay) {
        currentStreak = 1;
        checkDay = day - oneDay;
      } else {
        break;
      }
    }
  }

  // Calculate longest streak
  let longestStreak = 0;
  let streak = 1;
  for (let i = 0; i < uniqueDays.length - 1; i++) {
    if (uniqueDays[i] - uniqueDays[i + 1] === oneDay) {
      streak++;
    } else {
      longestStreak = Math.max(longestStreak, streak);
      streak = 1;
    }
  }
  longestStreak = Math.max(longestStreak, streak);

  return { current: currentStreak, longest: longestStreak };
}

/**
 * Get monthly reading counts for the last 12 months.
 */
export function getMonthlyReadingCounts(books: BookEntry[]): Array<{ month: string; count: number }> {
  const now = new Date();
  const months: Array<{ month: string; count: number }> = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

    const count = books.filter((b) => {
      if (b.status !== 'read' || !b.finishedReading) return false;
      const fd = new Date(b.finishedReading);
      return fd.getFullYear() === year && fd.getMonth() === month;
    }).length;

    months.push({ month: label, count });
  }

  return months;
}
