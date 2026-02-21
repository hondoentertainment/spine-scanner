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
  /** Star rating 1–5 set by the user. */
  rating?: 1 | 2 | 3 | 4 | 5;
  notes: string;
  dateAdded: string;
  /** ISO string set automatically when status changes to 'reading'. Can be edited manually. */
  dateStarted?: string;
  /** ISO string set automatically when status changes to 'read' or 'dnf'. Can be edited manually. */
  dateFinished?: string;
  /** ISO string updated on every local mutation; used for timestamp-based sync conflict resolution. */
  updatedAt?: string;
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
