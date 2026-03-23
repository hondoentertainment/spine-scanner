import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { indexedDBStorage } from '../lib/storage.ts';

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
}

export const useSyncQueue = create<SyncQueueStore>()(
  persist(
    (set, get) => ({
      pendingChanges: 0,
      lastSyncedAt: null,
      lastSyncFailedAt: null,
      flushing: false,

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
        set({ pendingChanges: 0, lastSyncedAt: null, lastSyncFailedAt: null, flushing: false }),
    }),
    {
      name: 'spine-scanner-sync-queue',
      storage: createJSONStorage(() => indexedDBStorage),
      // Only persist pendingChanges and lastSyncedAt, not transient flushing state
      partialize: (state) => ({
        pendingChanges: state.pendingChanges,
        lastSyncedAt: state.lastSyncedAt,
      }),
    }
  )
);
