/** Which API or flow provided the book's metadata. */
export type MetadataSource = 'google_books' | 'open_library' | 'manual' | 'photo';

/** Fields the user has explicitly edited, protecting them from metadata refreshes. */
export type UserEditableField = 'title' | 'author' | 'pageCount' | 'coverImg';

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
  /** Which API or flow supplied the current metadata. */
  metadataSource?: MetadataSource;
  /** Fields the user has manually edited; metadata refreshes skip these. */
  userEditedFields?: UserEditableField[];
  /** ISO date when the book's status was first set to 'reading'. */
  startedAt?: string;
  /** ISO date when the book's status was first set to 'read'. */
  finishedAt?: string;
  /** User-entered current page for in-progress books. */
  progressPages?: number;
  /** ISO timestamp of the last local update; used for conflict resolution during sync. */
  updatedAt?: string;
  /** ISO timestamp when soft-deleted; undefined means not deleted. */
  deletedAt?: string;
  /** Detected or user-confirmed series name (e.g. "Kingkiller Chronicle"). */
  series?: string;
  /** Numeric position within the series (1-based). */
  seriesNumber?: number;
  /** Name of the person the book is currently lent to. */
  lentTo?: string;
  /** ISO date when the book was lent out. */
  lentAt?: string;
  /** ISO date when the book is due back. Undefined = no due date set. */
  lentDue?: string;
  /** ISO date when the book was returned. Set when marking returned. */
  returnedAt?: string;
}

/** Fields that a smart shelf rule can evaluate. */
export type SmartShelfField = 'status' | 'title' | 'author' | 'pageCount' | 'dateAdded' | 'hasProgress';

/** Comparison operators for smart shelf rules. */
export type SmartShelfOp = 'eq' | 'neq' | 'contains' | 'gt' | 'lt' | 'within_days';

export interface SmartShelfRule {
  field: SmartShelfField;
  op: SmartShelfOp;
  /** Serialized value — numbers and booleans are stored as strings. */
  value: string;
}

/** A rule-based shelf that auto-matches books without manual assignment. */
export interface SmartShelf {
  id: string;
  name: string;
  color: string;
  rules: SmartShelfRule[];
  /** 'all' = every rule must match; 'any' = at least one rule must match. */
  match: 'all' | 'any';
}

export interface Shelf {
  id: string;
  name: string;
  color: string;
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
