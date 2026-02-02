import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BookEntry } from '../types.ts';

interface BookStore {
  books: BookEntry[];
  addBook: (book: BookEntry) => void;
  removeBook: (id: string) => void;
  updateBookStatus: (id: string, status: BookEntry['status']) => void;
  updateBookNotes: (id: string, notes: string) => void;
}

export const useBookStore = create<BookStore>()(
  persist(
    (set) => ({
      books: [],
      addBook: (book) => set((state) => ({ books: [book, ...state.books] })),
      removeBook: (id) => set((state) => ({ books: state.books.filter((b) => b.id !== id) })),
      updateBookStatus: (id, status) =>
        set((state) => ({
          books: state.books.map((b) => (b.id === id ? { ...b, status } : b)),
        })),
      updateBookNotes: (id, notes) =>
        set((state) => ({
          books: state.books.map((b) => (b.id === id ? { ...b, notes } : b)),
        })),
    }),
    {
      name: 'spine-scanner-storage',
    }
  )
);
