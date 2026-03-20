import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_HISTORY_ENTRIES = 100;

export interface SyncHistoryEntry {
  id: string;
  timestamp: string;
  direction: 'push' | 'pull' | 'merge';
  status: 'success' | 'failed' | 'partial';
  booksChanged: number;
  shelvesChanged: number;
  conflictsResolved: number;
  errorMessage?: string;
  duration: number; // ms
}

interface SyncHistoryStore {
  history: SyncHistoryEntry[];
  addEntry: (entry: SyncHistoryEntry) => void;
  getRecent: (limit?: number) => SyncHistoryEntry[];
  clearHistory: () => void;
  /** Last known good snapshot for recovery */
  lastGoodSnapshot: { books: string; shelves: string; timestamp: string } | null;
  saveSnapshot: (books: string, shelves: string) => void;
  getSnapshot: () => { books: string; shelves: string; timestamp: string } | null;
}

export const useSyncHistoryStore = create<SyncHistoryStore>()(
  persist(
    (set, get) => ({
      history: [],
      lastGoodSnapshot: null,

      addEntry: (entry: SyncHistoryEntry) =>
        set((state) => {
          const updated = [entry, ...state.history];
          // Cap at MAX_HISTORY_ENTRIES
          if (updated.length > MAX_HISTORY_ENTRIES) {
            updated.length = MAX_HISTORY_ENTRIES;
          }
          return { history: updated };
        }),

      getRecent: (limit = 10) => {
        return get().history.slice(0, limit);
      },

      clearHistory: () => set({ history: [], lastGoodSnapshot: null }),

      saveSnapshot: (books: string, shelves: string) =>
        set({
          lastGoodSnapshot: {
            books,
            shelves,
            timestamp: new Date().toISOString(),
          },
        }),

      getSnapshot: () => get().lastGoodSnapshot,
    }),
    {
      name: 'spine-scanner-sync-history',
    },
  ),
);
