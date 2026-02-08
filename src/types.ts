export interface BookEntry {
  id: string;
  isbn: string;
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
