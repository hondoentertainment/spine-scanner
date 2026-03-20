import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ActivityEntry } from '../types';

interface ActivityStore {
  entries: ActivityEntry[];
  addEntry: (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => void;
  getRecentEntries: (limit?: number) => ActivityEntry[];
  clearAll: () => void;
}

/** Maximum entries to store (FIFO — oldest are dropped). */
const MAX_ENTRIES = 500;

export const useActivityStore = create<ActivityStore>()(
  persist(
    (set, get) => ({
      entries: [],

      addEntry: (entry) =>
        set((state) => {
          const newEntry: ActivityEntry = {
            ...entry,
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
          };
          const entries = [newEntry, ...state.entries].slice(0, MAX_ENTRIES);
          return { entries };
        }),

      getRecentEntries: (limit = 20) => get().entries.slice(0, limit),

      clearAll: () => set({ entries: [] }),
    }),
    {
      name: 'spine-scanner-activity',
    }
  )
);
