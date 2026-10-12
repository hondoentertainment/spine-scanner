import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BookConflictSnapshot } from '../lib/bookConflicts.ts';
import type { BookEntry } from '../types.ts';

const SYNC_FAILED_RECENT_MS = 90_000;
const MAX_SYNC_HISTORY = 20;
const MAX_PENDING_MUTATIONS = 30;

export interface SyncHistoryEntry {
  id: string;
  at: string;
  outcome: 'synced' | 'failed';
  pendingChanges: number;
  conflictCount: number;
}

export interface PendingMutation {
  id: string;
  at: string;
  label: string;
}

function nextHistory(
  history: SyncHistoryEntry[],
  outcome: SyncHistoryEntry['outcome'],
  pendingChanges: number,
  conflictCount: number,
): SyncHistoryEntry[] {
  const entry: SyncHistoryEntry = {
    id: `${Date.now()}-${history.length}-${outcome}`,
    at: new Date().toISOString(),
    outcome,
    pendingChanges,
    conflictCount,
  };
  return [entry, ...history].slice(0, MAX_SYNC_HISTORY);
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
  /** JSON snapshot of books[] saved before the last sync push */
  lastGoodSnapshot: string | null;
  /** Timestamp when the snapshot was taken */
  lastGoodSnapshotAt: string | null;
  /** Whether a conflict was detected in the last sync (remote had newer data for ≥1 book) */
  hadConflictLastSync: boolean;
  /** IDs of the specific books whose local and remote versions differed in the last sync. */
  lastConflictBookIds: string[];
  /** Both copies for books the user can still choose between. */
  bookConflicts: BookConflictSnapshot[];
  /** Newest-first record of recent sync attempts. */
  syncHistory: SyncHistoryEntry[];
  /** Labels for local edits that have not been pushed yet. */
  pendingMutations: PendingMutation[];
  /** Whether sync recently failed (within SYNC_FAILED_RECENT_MS) */
  syncFailedRecently: () => boolean;
  /** Mark that a local mutation happened (increment pending count) */
  markDirty: (label?: string) => void;
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
  /** Record both copies of each conflicted book. */
  setBookConflicts: (conflicts: BookConflictSnapshot[]) => void;
  /** Drop one resolved conflict. Clears the flag when none remain. */
  resolveBookConflict: (bookId: string) => void;
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
      bookConflicts: [],
      syncHistory: [],
      pendingMutations: [],

      syncFailedRecently: () => {
        const t = get().lastSyncFailedAt;
        return t != null && Date.now() - t < SYNC_FAILED_RECENT_MS;
      },

      markDirty: (label) =>
        set((state) => ({
          pendingChanges: state.pendingChanges + 1,
          pendingMutations: label
            ? [
                ...state.pendingMutations,
                { id: `${Date.now()}-${state.pendingMutations.length}`, at: new Date().toISOString(), label },
              ].slice(-MAX_PENDING_MUTATIONS)
            : state.pendingMutations,
        })),

      markSynced: () =>
        set((state) => ({
          pendingChanges: 0,
          pendingMutations: [],
          lastSyncedAt: new Date().toISOString(),
          lastSyncFailedAt: null,
          syncHistory: nextHistory(state.syncHistory, 'synced', state.pendingChanges, state.lastConflictBookIds.length),
        })),

      markSyncFailed: () =>
        set((state) => ({
          lastSyncFailedAt: Date.now(),
          syncHistory: nextHistory(state.syncHistory, 'failed', state.pendingChanges, state.lastConflictBookIds.length),
        })),

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
          bookConflicts: [],
          syncHistory: [],
          pendingMutations: [],
        }),

      saveSnapshot: (books) =>
        set({
          lastGoodSnapshot: JSON.stringify(books),
          lastGoodSnapshotAt: new Date().toISOString(),
        }),

      clearSnapshot: () => set({ lastGoodSnapshot: null, lastGoodSnapshotAt: null }),

      markConflict: (had) =>
        set({
          hadConflictLastSync: had,
          ...(had ? {} : { lastConflictBookIds: [], bookConflicts: [] }),
        }),

      setConflictBookIds: (ids) =>
        set((state) => ({
          hadConflictLastSync: ids.length > 0,
          lastConflictBookIds: ids,
          bookConflicts: state.bookConflicts.filter((conflict) => ids.includes(conflict.bookId)),
        })),

      setBookConflicts: (conflicts) =>
        set({
          hadConflictLastSync: conflicts.length > 0,
          lastConflictBookIds: conflicts.map((conflict) => conflict.bookId),
          bookConflicts: conflicts,
        }),

      resolveBookConflict: (bookId) =>
        set((state) => {
          const bookConflicts = state.bookConflicts.filter((conflict) => conflict.bookId !== bookId);
          const lastConflictBookIds = state.lastConflictBookIds.filter((id) => id !== bookId);
          return {
            bookConflicts,
            lastConflictBookIds,
            hadConflictLastSync: lastConflictBookIds.length > 0,
          };
        }),
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
        bookConflicts: state.bookConflicts,
        syncHistory: state.syncHistory,
        pendingMutations: state.pendingMutations,
      }),
    }
  )
);
