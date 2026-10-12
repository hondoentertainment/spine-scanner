import type { BookEntry } from '../types.ts';
import { isOnLoan } from './loans.ts';
import { formatPhysicalLocation, matchesPhysicalLocation, normalizePhysicalLocation } from './physicalLocation.ts';

export interface LibraryBookFilter {
  searchTerm?: string;
  status?: BookEntry['status'] | 'all';
  shelfId?: string | null;
  reviewOnly?: boolean;
  seriesName?: string | null;
  lentOnly?: boolean;
  minPages?: number | null;
  maxPages?: number | null;
  locationRoom?: string | null;
  locationCase?: string | null;
  locationShelf?: string | null;
}

/** Books that match the library toolbar: status, virtual shelf, and physical room / case / shelf. */
export function filterLibraryBooks(books: BookEntry[], filter: LibraryBookFilter): BookEntry[] {
  const loweredSearch = filter.searchTerm?.trim().toLowerCase() ?? '';
  const status = filter.status ?? 'all';
  const shelfId = filter.shelfId ?? null;
  const seriesName = filter.seriesName ?? null;
  const minPages = filter.minPages ?? null;
  const maxPages = filter.maxPages ?? null;

  return books.filter((book) => {
    const location = normalizePhysicalLocation(book);
    const locationText = `${location.locationRoom} ${location.locationCase} ${location.locationShelf} ${formatPhysicalLocation(book)}`.toLowerCase();
    const borrower = [
      book.lentTo ?? '',
      book.loan?.borrowerName ?? '',
      ...(book.loanLedger ?? []).map((entry) => entry.lentTo),
    ].join(' ').toLowerCase();
    const matchesSearch = !loweredSearch
      || book.title.toLowerCase().includes(loweredSearch)
      || book.author.toLowerCase().includes(loweredSearch)
      || book.isbn.includes(loweredSearch)
      || locationText.includes(loweredSearch)
      || borrower.includes(loweredSearch);
    const matchesStatus = status === 'all' || book.status === status;
    const matchesShelf = !shelfId || (book.shelfIds || []).includes(shelfId);
    const matchesReview = !filter.reviewOnly || book.needsReview === true;
    const matchesMin = minPages == null || (book.pageCount || 0) >= minPages;
    const matchesMax = maxPages == null || (book.pageCount || 0) <= maxPages;
    const matchesSeries = !seriesName || book.seriesName?.trim() === seriesName;
    const matchesLoan = !filter.lentOnly || isOnLoan(book);
    const matchesLocation = matchesPhysicalLocation(book, filter);
    return matchesSearch && matchesStatus && matchesShelf && matchesReview && matchesMin && matchesMax && matchesSeries && matchesLoan && matchesLocation;
  });
}
