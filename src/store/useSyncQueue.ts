import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SyncQueueStore {
  /** Number of local mutations since the last successful cloud sync */
  pendingChanges: number;
  /** Timestamp of the last successful sync (ISO string or null) */
  lastSyncedAt: string | null;
  /** Whether a sync flush is currently in progress */
  flushing: boolean;
  /** Mark that a local mutation happened (increment pending count) */
  markDirty: () => void;
  /** Mark that a sync completed successfully */
  markSynced: () => void;
  /** Set flushing state */
  setFlushing: (flushing: boolean) => void;
  /** Reset the queue (e.g. on sign-out) */
  reset: () => void;
}

export const useSyncQueue = create<SyncQueueStore>()(
  persist(
    (set) => ({
      pendingChanges: 0,
      lastSyncedAt: null,
      flushing: false,

      markDirty: () =>
        set((state) => ({ pendingChanges: state.pendingChanges + 1 })),

      markSynced: () =>
        set({ pendingChanges: 0, lastSyncedAt: new Date().toISOString() }),

      setFlushing: (flushing) => set({ flushing }),

      reset: () =>
        set({ pendingChanges: 0, lastSyncedAt: null, flushing: false }),
    }),
    {
      name: 'spine-scanner-sync-queue',
      // Only persist pendingChanges and lastSyncedAt, not transient flushing state
      partialize: (state) => ({
        pendingChanges: state.pendingChanges,
        lastSyncedAt: state.lastSyncedAt,
      }),
    }
  )
);
