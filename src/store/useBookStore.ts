import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BookEntry, Shelf, SmartShelf } from '../types.ts';

// ─── Storage quota guard ─────────────────────────────────────────────────────

const QUOTA_WARN_RATIO = 0.85;

async function checkStorageQuota(): Promise<{ nearLimit: boolean; usageRatio: number }> {
  if (typeof navigator === 'undefined' || !('storage' in navigator) || !('estimate' in navigator.storage)) {
    return { nearLimit: false, usageRatio: 0 };
  }
  try {
    const { usage = 0, quota = 1 } = await navigator.storage.estimate();
    const ratio = usage / quota;
    return { nearLimit: ratio > QUOTA_WARN_RATIO, usageRatio: ratio };
  } catch {
    return { nearLimit: false, usageRatio: 0 };
  }
}

// ─── Soft-delete tombstone age ───────────────────────────────────────────────

const SOFT_DELETE_PURGE_DAYS = 30;

function isPurgeCandidate(book: BookEntry): boolean {
  if (!book.deletedAt) return false;
  const deletedMs = Date.parse(book.deletedAt);
  return Date.now() - deletedMs > SOFT_DELETE_PURGE_DAYS * 24 * 60 * 60 * 1000;
}

// ─── Store ───────────────────────────────────────────────────────────────────

interface BookStore {
  books: BookEntry[];
  shelves: Shelf[];
  smartShelves: SmartShelf[];
  /** True when storage is >85% full — surface a warning in the UI. */
  storageNearLimit: boolean;
  addBook: (book: BookEntry) => void;
  removeBook: (id: string) => void;
  /** Permanently delete all soft-deleted books older than 30 days. */
  purgeDeletedBooks: () => void;
  /** Restore a soft-deleted book within the undo window. */
  restoreBook: (id: string) => void;
  updateBook: (id: string, updates: Partial<Omit<BookEntry, 'id'>>) => void;
  updateBookStatus: (id: string, status: BookEntry['status']) => void;
  updateBookNotes: (id: string, notes: string) => void;
  setBooks: (books: BookEntry[]) => void;
  addShelf: (shelf: Shelf) => void;
  updateShelf: (id: string, updates: Partial<Omit<Shelf, 'id'>>) => void;
  removeShelf: (id: string) => void;
  setShelves: (shelves: Shelf[]) => void;
  assignShelf: (bookId: string, shelfId: string) => void;
  unassignShelf: (bookId: string, shelfId: string) => void;
  addSmartShelf: (shelf: SmartShelf) => void;
  updateSmartShelf: (id: string, updates: Partial<Omit<SmartShelf, 'id'>>) => void;
  removeSmartShelf: (id: string) => void;
  checkQuota: () => Promise<void>;
}

const now = () => new Date().toISOString();

export const useBookStore = create<BookStore>()(
  persist(
    (set, get) => ({
      books: [],
      shelves: [],
      smartShelves: [],
      storageNearLimit: false,

      addBook: (book) =>
        set((state) => ({
          books: [{ ...book, updatedAt: now() }, ...state.books],
        })),

      // Soft-delete: stamp deletedAt; hard-delete books already in the trash
      removeBook: (id) =>
        set((state) => ({
          books: state.books.map((b) =>
            b.id === id ? { ...b, deletedAt: now(), updatedAt: now() } : b
          ),
        })),

      purgeDeletedBooks: () =>
        set((state) => ({
          books: state.books.filter((b) => !isPurgeCandidate(b)),
        })),

      restoreBook: (id) =>
        set((state) => ({
          books: state.books.map((b) =>
            b.id === id ? { ...b, deletedAt: undefined, updatedAt: now() } : b
          ),
        })),

      updateBook: (id, updates) =>
        set((state) => ({
          books: state.books.map((b) =>
            b.id === id ? { ...b, ...updates, updatedAt: now() } : b
          ),
        })),

      updateBookStatus: (id, status) =>
        set((state) => ({
          books: state.books.map((b) => {
            if (b.id !== id) return b;
            const ts = now();
            return {
              ...b,
              status,
              updatedAt: ts,
              startedAt: status === 'reading' ? (b.startedAt ?? ts) : b.startedAt,
              finishedAt: status === 'read' ? (b.finishedAt ?? ts) : b.finishedAt,
            };
          }),
        })),

      updateBookNotes: (id, notes) =>
        set((state) => ({
          books: state.books.map((b) =>
            b.id === id ? { ...b, notes, updatedAt: now() } : b
          ),
        })),

      setBooks: (books) => set({ books }),

      addShelf: (shelf) => set((state) => ({ shelves: [...state.shelves, shelf] })),

      updateShelf: (id, updates) =>
        set((state) => ({
          shelves: state.shelves.map((s) => (s.id === id ? { ...s, ...updates } : s)),
        })),

      removeShelf: (id) =>
        set((state) => ({
          shelves: state.shelves.filter((s) => s.id !== id),
          books: state.books.map((b) => ({
            ...b,
            shelfIds: (b.shelfIds || []).filter((sid) => sid !== id),
          })),
        })),

      setShelves: (shelves) => set({ shelves }),

      assignShelf: (bookId, shelfId) =>
        set((state) => ({
          books: state.books.map((b) =>
            b.id === bookId && !(b.shelfIds || []).includes(shelfId)
              ? { ...b, shelfIds: [...(b.shelfIds || []), shelfId], updatedAt: now() }
              : b
          ),
        })),

      unassignShelf: (bookId, shelfId) =>
        set((state) => ({
          books: state.books.map((b) =>
            b.id === bookId
              ? { ...b, shelfIds: (b.shelfIds || []).filter((sid) => sid !== shelfId), updatedAt: now() }
              : b
          ),
        })),

      addSmartShelf: (shelf) =>
        set((state) => ({ smartShelves: [...state.smartShelves, shelf] })),

      updateSmartShelf: (id, updates) =>
        set((state) => ({
          smartShelves: state.smartShelves.map((s) => (s.id === id ? { ...s, ...updates } : s)),
        })),

      removeSmartShelf: (id) =>
        set((state) => ({ smartShelves: state.smartShelves.filter((s) => s.id !== id) })),

      checkQuota: async () => {
        const { nearLimit } = await checkStorageQuota();
        if (nearLimit !== get().storageNearLimit) {
          set({ storageNearLimit: nearLimit });
        }
        // Also purge 30-day-old tombstones on quota check
        get().purgeDeletedBooks();
      },
    }),
    {
      name: 'spine-scanner-storage',
    }
  )
);
