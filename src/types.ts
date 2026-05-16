export interface BookEntry {
  id: string;
  isbn: string;
  /** True when the book was added by photo only (no ISBN). isbn will be photo-{uuid}. */
  isPhotoOnly?: boolean;
  title: string;
  author: string;
  pageCount: number;
  amazonLink: string;
  coverImg: string;
  status: 'to-read' | 'reading' | 'read' | 'dnf';
  notes: string;
  dateAdded: string;
  shelfIds: string[];
  needsReview?: boolean;
  reviewReason?: string;
  pagesFinished?: number;
  startedAt?: string | null;
  finishedAt?: string | null;
  lastProgressAt?: string | null;
  /** Optional series / collection label (e.g. "The Expanse"). */
  seriesName?: string;
  /** Volume number within the series, when known. */
  seriesIndex?: number;
  /** Short quotes or reading notes kept as separate lines. */
  highlights?: string[];
  /** Which provider supplied this book's metadata (Phase 26). */
  metadataSource?: MetadataSource;
  /** Fields that Google Books and Open Library disagreed on at lookup time. */
  metadataConflicts?: MetadataConflict[];
  /**
   * Per-field flag indicating the user has manually edited that field.
   * A subsequent "Refresh metadata" must not overwrite flagged fields.
   */
  userEditedFields?: UserEditedFields;
}

export type MetadataSource = 'google_books' | 'open_library' | 'manual';

/** A field-level disagreement between Google Books and Open Library for the same ISBN. */
export interface MetadataConflict {
  field: 'author' | 'pageCount' | 'title';
  googleBooks?: string | number;
  openLibrary?: string | number;
}

export interface UserEditedFields {
  title?: boolean;
  author?: boolean;
  pageCount?: boolean;
  coverImg?: boolean;
}

export const METADATA_SOURCE_LABEL: Record<MetadataSource, string> = {
  google_books: 'Google Books',
  open_library: 'Open Library',
  manual: 'Manual entry',
};

export interface Shelf {
  id: string;
  name: string;
  color: string;
}

export interface SmartShelf {
  id: string;
  name: string;
  color: string;
  searchTerm?: string;
  statusFilter?: BookEntry['status'] | 'all';
  minPageCount?: number | null;
  maxPageCount?: number | null;
  reviewOnly?: boolean;
}

export interface SavedView {
  id: string;
  name: string;
  searchTerm: string;
  statusFilter: BookEntry['status'] | 'all';
  shelfId: string | null;
  sortBy: ProfilePreferences['librarySortBy'];
  sortAsc: boolean;
  smartShelfId?: string | null;
  reviewOnly?: boolean;
  minPageCount?: number | null;
  maxPageCount?: number | null;
}

export interface ReadingSession {
  id: string;
  bookId: string;
  durationMin: number;
  pagesRead: number;
  date: string;
}

export const SHELF_COLORS = [
  '#6366f1', // indigo
  '#f43f5e', // rose
  '#22c55e', // green
  '#f59e0b', // amber
  '#06b6d4', // cyan
  '#a855f7', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#ef4444', // red
  '#3b82f6', // blue
] as const;

/** User profile preferences stored per-profile (local or cloud). */
export interface ProfilePreferences {
  theme: 'light' | 'dark' | 'system' | 'high-contrast';
  librarySortBy: 'title' | 'author' | 'dateAdded' | 'pageCount';
  librarySortAsc: boolean;
  libraryViewMode: 'grid' | 'list' | 'masonry';
  libraryStatusFilter: 'all' | 'to-read' | 'reading' | 'read' | 'dnf';
  batchModeDefault: boolean;
  showStatsDefault: boolean;
  showShelvesDefault: boolean;
  onboardingCompleted: boolean;
  smartShelves: SmartShelf[];
  savedViews: SavedView[];
  /** Target finished books this calendar year; null disables the goal. */
  readingGoalBooksPerYear: number | null;
  /** Target pages finished this calendar year; null disables the goal. */
  readingGoalPagesPerYear: number | null;
  /** When true, warn before adding a second copy of the same ISBN. */
  warnOnDuplicateIsbn: boolean;
  /** Consecutive days with reading activity. */
  currentStreak: number;
  /** All-time best streak. */
  longestStreak: number;
  /** ISO date string (YYYY-MM-DD) of the last day reading activity was recorded. */
  lastStreakDate: string | null;
  /** When true, anonymous usage analytics are recorded locally. Opt-in. */
  analyticsOptIn: boolean;
}

export const DEFAULT_PREFERENCES: ProfilePreferences = {
  theme: 'dark',
  librarySortBy: 'dateAdded',
  librarySortAsc: false,
  libraryViewMode: 'grid',
  libraryStatusFilter: 'all',
  batchModeDefault: false,
  showStatsDefault: false,
  showShelvesDefault: false,
  onboardingCompleted: false,
  smartShelves: [],
  savedViews: [],
  readingGoalBooksPerYear: null,
  readingGoalPagesPerYear: null,
  warnOnDuplicateIsbn: true,
  currentStreak: 0,
  longestStreak: 0,
  lastStreakDate: null,
  analyticsOptIn: false,
};
