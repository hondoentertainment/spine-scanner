import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BookEntry } from '../types.ts';
import { useBookStore } from './useBookStore.ts';

const SYNC_FAILED_RECENT_MS = 90_000;

export interface SyncConflict {
  bookId: string;
  local: BookEntry;
  remote: BookEntry;
}

interface SyncQueueStore {
  /** Number of local mutations since the last successful cloud sync */
  pendingChanges: number;
  /** Timestamp of the last successful sync (ISO string or null) */
  lastSyncedAt: string | null;
  /** Timestamp when sync last failed (ms) – used to show Retry in AuthPanel */
  lastSyncFailedAt: number | null;
  /** Whether a sync flush is currently in progress */
  flushing: boolean;
  /** Detected sync conflicts awaiting user resolution */
  conflicts: SyncConflict[];
  /** Whether sync recently failed (within SYNC_FAILED_RECENT_MS) */
  syncFailedRecently: () => boolean;
  /** Mark that a local mutation happened (increment pending count) */
  markDirty: () => void;
  /** Mark that a sync completed successfully */
  markSynced: () => void;
  /** Mark that sync failed – enables Retry UI */
  markSyncFailed: () => void;
  /** Set flushing state */
  setFlushing: (flushing: boolean) => void;
  /** Reset the queue (e.g. on sign-out) */
  reset: () => void;
  /** Add a conflict (deduplicates by bookId) */
  addConflict: (conflict: SyncConflict) => void;
  /** Resolve a conflict – keep 'local' does nothing to books; keep 'remote' updates the book */
  resolveConflict: (bookId: string, keep: 'local' | 'remote') => void;
  /** Clear all conflicts */
  clearConflicts: () => void;
}

export const useSyncQueue = create<SyncQueueStore>()(
  persist(
    (set, get) => ({
      pendingChanges: 0,
      lastSyncedAt: null,
      lastSyncFailedAt: null,
      flushing: false,
      conflicts: [],

      syncFailedRecently: () => {
        const t = get().lastSyncFailedAt;
        return t != null && Date.now() - t < SYNC_FAILED_RECENT_MS;
      },

      markDirty: () =>
        set((state) => ({ pendingChanges: state.pendingChanges + 1 })),

      markSynced: () =>
        set({ pendingChanges: 0, lastSyncedAt: new Date().toISOString(), lastSyncFailedAt: null }),

      markSyncFailed: () => set({ lastSyncFailedAt: Date.now() }),

      setFlushing: (flushing) => set({ flushing }),

      reset: () =>
        set({ pendingChanges: 0, lastSyncedAt: null, lastSyncFailedAt: null, flushing: false, conflicts: [] }),

      addConflict: (conflict) =>
        set((state) => ({
          conflicts: state.conflicts.some((c) => c.bookId === conflict.bookId)
            ? state.conflicts.map((c) => (c.bookId === conflict.bookId ? conflict : c))
            : [...state.conflicts, conflict],
        })),

      resolveConflict: (bookId, keep) => {
        if (keep === 'remote') {
          const conflict = get().conflicts.find((c) => c.bookId === bookId);
          if (conflict) {
            useBookStore.getState().updateBook(bookId, conflict.remote);
          }
        }
        set((state) => ({ conflicts: state.conflicts.filter((c) => c.bookId !== bookId) }));
      },

      clearConflicts: () => set({ conflicts: [] }),
    }),
    {
      name: 'spine-scanner-sync-queue',
      // Only persist pendingChanges and lastSyncedAt, not transient state
      partialize: (state) => ({
        pendingChanges: state.pendingChanges,
        lastSyncedAt: state.lastSyncedAt,
      }),
    }
  )
);
