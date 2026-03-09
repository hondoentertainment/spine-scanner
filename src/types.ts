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

/** Generate a unique ID, with fallback for environments without crypto.randomUUID. */
export function generateId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2);
}

/** Create a BookEntry with sensible defaults. Only provide the fields that differ. */
export function createBookEntry(overrides: Partial<BookEntry> & Pick<BookEntry, 'isbn' | 'title' | 'author'>): BookEntry {
  return {
    id: generateId(),
    pageCount: 0,
    amazonLink: '',
    coverImg: '',
    status: 'to-read',
    notes: '',
    dateAdded: new Date().toISOString(),
    shelfIds: [],
    ...overrides,
  };
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
