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
}

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
  libraryViewMode: 'grid' | 'list' | 'masonry';
  libraryStatusFilter: 'all' | 'to-read' | 'reading' | 'read' | 'dnf';
  batchModeDefault: boolean;
  showStatsDefault: boolean;
  showShelvesDefault: boolean;
  onboardingCompleted: boolean;
  smartShelves: SmartShelf[];
  savedViews: SavedView[];
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
};
