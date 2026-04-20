/** Where the displayed title/author/pages/cover came from (Phase 26 metadata layer). */
export type MetadataSource = 'google_books' | 'open_library' | 'manual';

/** Raw metadata from a single provider (Google Books or Open Library). */
export interface BookMetadata {
  title: string;
  authors: string[];
  pageCount: number;
  thumbnail: string;
  isbn: string;
}

/** Result of a full ISBN lookup (primary fields + both providers when available). */
export interface BookLookupResult extends BookMetadata {
  metadataSource: MetadataSource;
  google: BookMetadata | null;
  openLibrary: BookMetadata | null;
}

/** Snapshot from one provider for conflict hints and one-tap resolution. */
export interface MetadataPeerSnapshot {
  /** Omitted in older exports; treat as unknown when missing. */
  title?: string;
  author: string;
  pageCount: number;
  thumbnail?: string;
}

export interface BookEntry {
  id: string;
  isbn: string;
  /** True when the book was added by photo only (no ISBN). isbn will be photo-{uuid}. */
  isPhotoOnly?: boolean;
  /** Primary metadata API used for the current displayed fields, when known. */
  metadataSource?: MetadataSource;
  /** Side-by-side author/page snapshots when both Google Books and Open Library returned data. */
  metadataPeers?: {
    google?: MetadataPeerSnapshot;
    openLibrary?: MetadataPeerSnapshot;
  };
  /**
   * Per-field guard: refresh metadata will not overwrite fields the user has edited
   * in book detail (Save from Edit Details).
   */
  metadataUserEdited?: Partial<Record<'title' | 'author' | 'pageCount' | 'coverImg', true>>;
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
  /** Target finished books this calendar year; null disables the goal. */
  readingGoalBooksPerYear: number | null;
  /** Target pages finished this calendar year; null disables the goal. */
  readingGoalPagesPerYear: number | null;
  /** When true, warn before adding a second copy of the same ISBN. */
  warnOnDuplicateIsbn: boolean;
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
};
