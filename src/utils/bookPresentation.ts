import type { BookEntry } from '../types.ts';

export const FALLBACK_COVER_DATA_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 240'%3E%3Crect width='160' height='240' rx='18' fill='%23192634'/%3E%3Crect x='18' y='18' width='24' height='204' rx='12' fill='%23c084fc' fill-opacity='.35'/%3E%3Crect x='56' y='50' width='72' height='10' rx='5' fill='%23f8fafc' fill-opacity='.88'/%3E%3Crect x='56' y='74' width='56' height='8' rx='4' fill='%2394a3b8' fill-opacity='.9'/%3E%3Crect x='56' y='108' width='48' height='48' rx='10' fill='%2338bdf8' fill-opacity='.18' stroke='%2338bdf8' stroke-opacity='.35'/%3E%3Cpath d='M72 132h16M80 124v16' stroke='%2338bdf8' stroke-width='4' stroke-linecap='round'/%3E%3Crect x='56' y='178' width='52' height='8' rx='4' fill='%23f8fafc' fill-opacity='.55'/%3E%3C/svg%3E";

export interface LibraryInsights {
  totalBooks: number;
  readingCount: number;
  readCount: number;
  toReadCount: number;
  dnfCount: number;
  reviewCount: number;
  totalPages: number;
  pagesRead: number;
  completionRate: number;
  recentlyAdded: BookEntry[];
  currentlyReading: BookEntry | null;
  /** Books marked read with `finishedAt` in the current calendar year. */
  finishedThisYear: number;
}

export function getBookCoverSrc(coverImg?: string): string {
  return coverImg?.trim() ? coverImg : FALLBACK_COVER_DATA_URL;
}

export function getLibraryInsights(books: BookEntry[]): LibraryInsights {
  const readingCount = books.filter((book) => book.status === 'reading').length;
  const readCount = books.filter((book) => book.status === 'read').length;
  const toReadCount = books.filter((book) => book.status === 'to-read').length;
  const dnfCount = books.filter((book) => book.status === 'dnf').length;
  const reviewCount = books.filter((book) => book.needsReview).length;
  const totalPages = books.reduce((sum, book) => sum + (book.pageCount || 0), 0);
  const pagesRead = books
    .reduce((sum, book) => sum + (book.status === 'read' ? (book.pageCount || 0) : (book.pagesFinished || 0)), 0);
  const recentlyAdded = [...books]
    .sort((a, b) => Date.parse(b.dateAdded) - Date.parse(a.dateAdded))
    .slice(0, 3);
  const currentlyReading =
    [...books]
      .filter((book) => book.status === 'reading')
      .sort((a, b) => Date.parse(b.dateAdded) - Date.parse(a.dateAdded))[0] ?? null;

  const calendarYear = new Date().getFullYear();
  const finishedThisYear = books.filter((book) => {
    if (book.status !== 'read' || !book.finishedAt) return false;
    return new Date(book.finishedAt).getFullYear() === calendarYear;
  }).length;

  return {
    totalBooks: books.length,
    readingCount,
    readCount,
    toReadCount,
    dnfCount,
    reviewCount,
    totalPages,
    pagesRead,
    completionRate: books.length ? Math.round((readCount / books.length) * 100) : 0,
    recentlyAdded,
    currentlyReading,
    finishedThisYear,
  };
}

export function getActiveLibraryFilterLabels(options: {
  searchTerm: string;
  statusFilter: BookEntry['status'] | 'all';
  shelfName?: string | null;
}): string[] {
  const labels: string[] = [];
  const trimmedSearch = options.searchTerm.trim();

  if (trimmedSearch) {
    labels.push(`Search: ${trimmedSearch}`);
  }

  if (options.statusFilter !== 'all') {
    labels.push(`Status: ${options.statusFilter.replace('-', ' ')}`);
  }

  if (options.shelfName) {
    labels.push(`Shelf: ${options.shelfName}`);
  }

  return labels;
}
