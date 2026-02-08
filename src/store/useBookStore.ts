import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BookEntry, Shelf } from '../types.ts';

interface BookStore {
  books: BookEntry[];
  shelves: Shelf[];
  addBook: (book: BookEntry) => void;
  removeBook: (id: string) => void;
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
}

export const useBookStore = create<BookStore>()(
  persist(
    (set) => ({
      books: [],
      shelves: [],
      addBook: (book) => set((state) => ({ books: [book, ...state.books] })),
      removeBook: (id) => set((state) => ({ books: state.books.filter((b) => b.id !== id) })),
      updateBook: (id, updates) =>
        set((state) => ({
          books: state.books.map((b) => (b.id === id ? { ...b, ...updates } : b)),
        })),
      updateBookStatus: (id, status) =>
        set((state) => ({
          books: state.books.map((b) => (b.id === id ? { ...b, status } : b)),
        })),
      updateBookNotes: (id, notes) =>
        set((state) => ({
          books: state.books.map((b) => (b.id === id ? { ...b, notes } : b)),
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
              ? { ...b, shelfIds: (b.shelfIds || []).filter((sid) => sid !== shelfId) }
              : b
          ),
        })),
    }),
    {
      name: 'spine-scanner-storage',
    }
  )
);
