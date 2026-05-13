import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BookEntry, ProfilePreferences, Shelf } from '../types.ts';
import { normalizeBookEntry, normalizeBooks, updateBookForStatus, updateBookProgress } from '../utils/bookState.ts';
import { migrateBooks } from '../lib/schemaMigrations.ts';
import { useProfileStore } from './useProfileStore.ts';

export function toLocalDateKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function advanceStreak(prefs: ProfilePreferences): Partial<ProfilePreferences> {
  const todayDate = new Date();
  const yesterdayDate = new Date(todayDate);
  yesterdayDate.setDate(todayDate.getDate() - 1);
  const today = toLocalDateKey(todayDate);
  const yesterday = toLocalDateKey(yesterdayDate);

  if (prefs.lastStreakDate === today) {
    return {};
  }
  if (prefs.lastStreakDate === yesterday) {
    const next = prefs.currentStreak + 1;
    return {
      currentStreak: next,
      longestStreak: Math.max(prefs.longestStreak, next),
      lastStreakDate: today,
    };
  }
  return {
    currentStreak: 1,
    longestStreak: Math.max(prefs.longestStreak, 1),
    lastStreakDate: today,
  };
}

function pickBetterTitle(a: string, b: string): string {
  const ta = a.trim();
  const tb = b.trim();
  const la = ta.toLowerCase();
  const lb = tb.toLowerCase();
  if (!tb) return ta;
  if (!ta) return tb;
  if (la === 'unknown title' || la === 'review isbn entry') return tb;
  if (lb === 'unknown title' || lb === 'review isbn entry') return ta;
  return ta.length >= tb.length ? ta : tb;
}

function pickBetterAuthor(a: string, b: string): string {
  const ta = a.trim();
  const tb = b.trim();
  const la = ta.toLowerCase();
  const lb = tb.toLowerCase();
  if (!tb) return ta;
  if (!ta) return tb;
  if (la === 'unknown author' || la === 'manual entry') return tb;
  if (lb === 'unknown author' || lb === 'manual entry') return ta;
  return ta.length >= tb.length ? ta : tb;
}

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
  /** Merge duplicate rows into one entry (keep `keepId`, drop others). */
  mergeBooks: (keepId: string, removeIds: string[]) => void;
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
      updateBookStatus: (id, status) => {
        let bookUpdated = false;
        set((state) => {
          bookUpdated = state.books.some((b) => b.id === id);
          return { books: state.books.map((b) => (b.id === id ? updateBookForStatus(b, status) : b)) };
        });
        if (bookUpdated && (status === 'read' || status === 'reading')) {
          const prefs = useProfileStore.getState().preferences;
          useProfileStore.getState().updatePreferences(advanceStreak(prefs));
        }
      },
      updateBookNotes: (id, notes) =>
        set((state) => ({
          books: state.books.map((b) => (b.id === id ? { ...b, notes } : b)),
        })),
      updateReadingProgress: (id, pagesFinished) => {
        let bookUpdated = false;
        set((state) => {
          const hasBook = state.books.some((b) => b.id === id);
          bookUpdated = hasBook;
          return { books: state.books.map((b) => (b.id === id ? updateBookProgress(b, pagesFinished) : b)) };
        });
        if (pagesFinished > 0 && bookUpdated) {
          const prefs = useProfileStore.getState().preferences;
          useProfileStore.getState().updatePreferences(advanceStreak(prefs));
        }
      },
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
      bulkUpdateStatus: (ids, status) => {
        let anyUpdated = false;
        set((state) => {
          const idSet = new Set(ids);
          anyUpdated = state.books.some((b) => idSet.has(b.id));
          return { books: state.books.map((b) => (idSet.has(b.id) ? updateBookForStatus(b, status) : b)) };
        });
        if (anyUpdated && (status === 'read' || status === 'reading')) {
          const prefs = useProfileStore.getState().preferences;
          useProfileStore.getState().updatePreferences(advanceStreak(prefs));
        }
      },
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
      mergeBooks: (keepId, removeIds) =>
        set((state) => {
          const keep = state.books.find((b) => b.id === keepId);
          if (!keep) return state;
          const toRemove = new Set(removeIds.filter((id) => id !== keepId));
          let merged: BookEntry = { ...keep };
          for (const other of state.books) {
            if (!toRemove.has(other.id)) continue;
            merged = {
              ...merged,
              title: pickBetterTitle(merged.title, other.title),
              author: pickBetterAuthor(merged.author, other.author),
              pageCount: Math.max(merged.pageCount || 0, other.pageCount || 0),
              coverImg: merged.coverImg?.trim() ? merged.coverImg : other.coverImg,
              shelfIds: [...new Set([...(merged.shelfIds || []), ...(other.shelfIds || [])])],
              notes: [merged.notes, other.notes].filter((n) => n?.trim()).join('\n---\n'),
              highlights: [...(merged.highlights || []), ...(other.highlights || [])],
              seriesName: merged.seriesName?.trim() || other.seriesName?.trim() || undefined,
              seriesIndex: merged.seriesIndex ?? other.seriesIndex,
              amazonLink: merged.amazonLink?.trim() ? merged.amazonLink : other.amazonLink,
            };
          }
          const rest = state.books.filter((b) => b.id !== keepId && !toRemove.has(b.id));
          return { books: [normalizeBookEntry(merged), ...rest] };
        }),
    }),
    {
      name: 'spine-scanner-storage',
      merge: (persistedState, currentState) => {
        const p = persistedState as { books?: BookEntry[]; shelves?: Shelf[] } | undefined;
        const persistedBooks = p?.books ?? currentState.books;
        const migratedBooks = migrateBooks(persistedBooks);
        return {
          ...currentState,
          books: normalizeBooks(migratedBooks),
          shelves: p?.shelves ?? currentState.shelves,
        };
      },
    }
  )
);
