import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BookEntry } from '../types.ts';

const SYNC_FAILED_RECENT_MS = 90_000;

interface SyncQueueStore {
  /** Number of local mutations since the last successful cloud sync */
  pendingChanges: number;
  /** Timestamp of the last successful sync (ISO string or null) */
  lastSyncedAt: string | null;
  /** Timestamp when sync last failed (ms) – used to show Retry in AuthPanel */
  lastSyncFailedAt: number | null;
  /** Whether a sync flush is currently in progress */
  flushing: boolean;
  /** JSON snapshot of books[] saved before the last sync push */
  lastGoodSnapshot: string | null;
  /** Timestamp when the snapshot was taken */
  lastGoodSnapshotAt: string | null;
  /** Whether a conflict was detected in the last sync (remote had newer data for ≥1 book) */
  hadConflictLastSync: boolean;
  /** IDs of the specific books whose local and remote versions differed in the last sync. */
  lastConflictBookIds: string[];
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
  /** Save a snapshot of current books (call before pushing) */
  saveSnapshot: (books: BookEntry[]) => void;
  /** Clear the snapshot (call after restore so the button disappears) */
  clearSnapshot: () => void;
  /** Mark that a conflict was detected (keeps the boolean flag in sync with the id list). */
  markConflict: (had: boolean) => void;
  /** Record the specific book ids that conflicted in the last sync; also updates the flag. */
  setConflictBookIds: (ids: string[]) => void;
}

export const useSyncQueue = create<SyncQueueStore>()(
  persist(
    (set, get) => ({
      pendingChanges: 0,
      lastSyncedAt: null,
      lastSyncFailedAt: null,
      flushing: false,
      lastGoodSnapshot: null,
      lastGoodSnapshotAt: null,
      hadConflictLastSync: false,
      lastConflictBookIds: [],

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
        set({
          pendingChanges: 0,
          lastSyncedAt: null,
          lastSyncFailedAt: null,
          flushing: false,
          lastGoodSnapshot: null,
          lastGoodSnapshotAt: null,
          hadConflictLastSync: false,
          lastConflictBookIds: [],
        }),

      saveSnapshot: (books) =>
        set({
          lastGoodSnapshot: JSON.stringify(books),
          lastGoodSnapshotAt: new Date().toISOString(),
        }),

      clearSnapshot: () => set({ lastGoodSnapshot: null, lastGoodSnapshotAt: null }),

      markConflict: (had) =>
        set({ hadConflictLastSync: had, ...(had ? {} : { lastConflictBookIds: [] }) }),

      setConflictBookIds: (ids) =>
        set({ hadConflictLastSync: ids.length > 0, lastConflictBookIds: ids }),
    }),
    {
      name: 'spine-scanner-sync-queue',
      // Persist sync state and snapshot fields; omit transient flushing
      partialize: (state) => ({
        pendingChanges: state.pendingChanges,
        lastSyncedAt: state.lastSyncedAt,
        lastGoodSnapshot: state.lastGoodSnapshot,
        lastGoodSnapshotAt: state.lastGoodSnapshotAt,
        hadConflictLastSync: state.hadConflictLastSync,
        lastConflictBookIds: state.lastConflictBookIds,
      }),
    }
  )
);
