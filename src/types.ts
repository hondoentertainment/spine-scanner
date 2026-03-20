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
  /** Reading progress: pages read so far */
  pagesRead?: number;
  /** Reading progress: percent complete (0-100) */
  progressPercent?: number;
  /** Date reading started (ISO string) */
  startedReading?: string;
  /** Date finished reading (ISO string) */
  finishedReading?: string;
  /** 1-5 star rating */
  rating?: number;
  /** Where the metadata was fetched from */
  metadataSource?: 'google_books' | 'open_library' | 'manual' | 'import';
  /** Fields that the user has manually edited */
  userEditedFields?: string[];
}

export interface Shelf {
  id: string;
  name: string;
  color: string;
}

/** A rule-based smart shelf that auto-includes matching books */
export interface SmartShelf {
  id: string;
  name: string;
  color: string;
  icon?: string;
  /** Filter rules - all must match (AND logic) */
  rules: SmartShelfRule[];
}

export interface SmartShelfRule {
  field: 'status' | 'author' | 'title' | 'pageCount' | 'dateAdded' | 'rating' | 'metadataSource';
  operator: 'equals' | 'contains' | 'greaterThan' | 'lessThan' | 'before' | 'after';
  value: string;
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
  theme: 'light' | 'dark' | 'system';
  librarySortBy: 'title' | 'author' | 'dateAdded' | 'pageCount';
  librarySortAsc: boolean;
  libraryViewMode: 'grid' | 'list';
  libraryStatusFilter: 'all' | 'to-read' | 'reading' | 'read' | 'dnf';
  batchModeDefault: boolean;
  showStatsDefault: boolean;
  showShelvesDefault: boolean;
}

/** A lending record for tracking book loans */
export interface LendingRecord {
  id: string;
  bookId: string;
  borrowerName: string;
  lentDate: string;
  dueDate?: string;
  returnedDate?: string;
  notes?: string;
}

/** Activity feed entry */
export interface ActivityEntry {
  id: string;
  type: 'book_added' | 'book_finished' | 'book_lent' | 'book_returned' | 'status_changed' | 'rating_added';
  bookId: string;
  bookTitle: string;
  timestamp: string;
  detail?: string;
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
};
