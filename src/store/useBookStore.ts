import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { BookEntry, Shelf } from '../types.ts';
import { normalizeBookEntry, normalizeBooks, updateBookForStatus, updateBookProgress } from '../utils/bookState.ts';
import { indexedDBStorage } from '../lib/storage.ts';

interface BookStore {
  books: BookEntry[];
  shelves: Shelf[];
  addBook: (book: BookEntry) => void;
  removeBook: (id: string) => void;
  updateBook: (id: string, updates: Partial<Omit<BookEntry, 'id'>>) => void;
  updateBookStatus: (id: string, status: BookEntry['status']) => void;
  updateBookNotes: (id: string, notes: string) => void;
  updateReadingProgress: (id: string, pagesFinished: number) => void;
  markNeedsReview: (id: string, needsReview: boolean, reason?: string) => void;
  bulkUpdateBooks: (ids: string[], updates: Partial<Omit<BookEntry, 'id'>>) => void;
  bulkUpdateStatus: (ids: string[], status: BookEntry['status']) => void;
  bulkAssignShelf: (ids: string[], shelfId: string) => void;
  bulkUnassignShelf: (ids: string[], shelfId: string) => void;
  bulkRemoveBooks: (ids: string[]) => void;
  setBooks: (books: BookEntry[]) => void;
  addShelf: (shelf: Shelf) => void;
  updateShelf: (id: string, updates: Partial<Omit<Shelf, 'id'>>) => void;
  removeShelf: (id: string) => void;
  setShelves: (shelves: Shelf[]) => void;
  assignShelf: (bookId: string, shelfId: string) => void;
  unassignShelf: (bookId: string, shelfId: string) => void;
}

export const useBookStore = create<BookStore>()(
  persist(
    (set) => ({
      books: [],
      shelves: [],
      addBook: (book) => set((state) => ({ books: [normalizeBookEntry(book), ...state.books] })),
      removeBook: (id) => set((state) => ({ books: state.books.filter((b) => b.id !== id) })),
      updateBook: (id, updates) =>
        set((state) => ({
          books: state.books.map((b) => (b.id === id ? normalizeBookEntry({ ...b, ...updates }) : b)),
        })),
      updateBookStatus: (id, status) =>
        set((state) => ({
          books: state.books.map((b) => (b.id === id ? updateBookForStatus(b, status) : b)),
        })),
      updateBookNotes: (id, notes) =>
        set((state) => ({
          books: state.books.map((b) => (b.id === id ? { ...b, notes } : b)),
        })),
      updateReadingProgress: (id, pagesFinished) =>
        set((state) => ({
          books: state.books.map((b) => (b.id === id ? updateBookProgress(b, pagesFinished) : b)),
        })),
      markNeedsReview: (id, needsReview, reason = '') =>
        set((state) => ({
          books: state.books.map((b) => (
            b.id === id
              ? normalizeBookEntry({
                ...b,
                needsReview,
                reviewReason: needsReview ? reason || b.reviewReason : '',
              })
              : b
          )),
        })),
      bulkUpdateBooks: (ids, updates) =>
        set((state) => ({
          books: state.books.map((b) => (ids.includes(b.id) ? normalizeBookEntry({ ...b, ...updates }) : b)),
        })),
      bulkUpdateStatus: (ids, status) =>
        set((state) => ({
          books: state.books.map((b) => (ids.includes(b.id) ? updateBookForStatus(b, status) : b)),
        })),
      bulkAssignShelf: (ids, shelfId) =>
        set((state) => ({
          books: state.books.map((b) =>
            ids.includes(b.id) && !(b.shelfIds || []).includes(shelfId)
              ? normalizeBookEntry({ ...b, shelfIds: [...(b.shelfIds || []), shelfId] })
              : b
          ),
        })),
      bulkUnassignShelf: (ids, shelfId) =>
        set((state) => ({
          books: state.books.map((b) =>
            ids.includes(b.id)
              ? normalizeBookEntry({ ...b, shelfIds: (b.shelfIds || []).filter((sid) => sid !== shelfId) })
              : b
          ),
        })),
      bulkRemoveBooks: (ids) => set((state) => ({ books: state.books.filter((b) => !ids.includes(b.id)) })),
      setBooks: (books) => set({ books: normalizeBooks(books) }),
      addShelf: (shelf) => set((state) => ({ shelves: [...state.shelves, shelf] })),
      updateShelf: (id, updates) =>
        set((state) => ({
          shelves: state.shelves.map((s) => (s.id === id ? { ...s, ...updates } : s)),
        })),
      removeShelf: (id) =>
        set((state) => ({
          shelves: state.shelves.filter((s) => s.id !== id),
          // Also remove this shelf from all books
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
              ? { ...b, shelfIds: [...(b.shelfIds || []), shelfId] }
              : b
          ),
        })),
      unassignShelf: (bookId, shelfId) =>
        set((state) => ({
          books: state.books.map((b) =>
            b.id === bookId
              ? normalizeBookEntry({ ...b, shelfIds: (b.shelfIds || []).filter((sid) => sid !== shelfId) })
              : b
          ),
        })),
    }),
    {
      name: 'spine-scanner-storage',
      storage: createJSONStorage(() => indexedDBStorage),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<BookStore> | undefined;
        return {
          ...currentState,
          ...persisted,
          books: normalizeBooks(persisted?.books ?? currentState.books),
          shelves: persisted?.shelves ?? currentState.shelves,
        };
      },
    }
  )
);
