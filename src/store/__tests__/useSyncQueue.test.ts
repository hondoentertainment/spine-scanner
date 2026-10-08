import { describe, it, expect, beforeEach } from 'vitest';
import { useSyncQueue } from '../useSyncQueue';

describe('useSyncQueue', () => {
  beforeEach(() => {
    useSyncQueue.setState({
      pendingChanges: 0,
      lastSyncedAt: null,
      lastSyncFailedAt: null,
      flushing: false,
      hadConflictLastSync: false,
      lastConflictBookIds: [],
      bookConflicts: [],
      syncHistory: [],
      pendingMutations: [],
    });
  });

  describe('conflict tracking', () => {
    it('starts with no conflicted book ids', () => {
      expect(useSyncQueue.getState().lastConflictBookIds).toEqual([]);
      expect(useSyncQueue.getState().hadConflictLastSync).toBe(false);
    });

    it('setConflictBookIds sets both the id list and the flag', () => {
      useSyncQueue.getState().setConflictBookIds(['a', 'b', 'c']);
      expect(useSyncQueue.getState().lastConflictBookIds).toEqual(['a', 'b', 'c']);
      expect(useSyncQueue.getState().hadConflictLastSync).toBe(true);
    });

    it('setConflictBookIds with empty list clears the flag', () => {
      useSyncQueue.setState({ hadConflictLastSync: true, lastConflictBookIds: ['x'] });
      useSyncQueue.getState().setConflictBookIds([]);
      expect(useSyncQueue.getState().lastConflictBookIds).toEqual([]);
      expect(useSyncQueue.getState().hadConflictLastSync).toBe(false);
    });

    it('markConflict(false) clears the id list too so dismiss wipes both', () => {
      useSyncQueue.getState().setConflictBookIds(['x', 'y']);
      useSyncQueue.getState().markConflict(false);
      expect(useSyncQueue.getState().hadConflictLastSync).toBe(false);
      expect(useSyncQueue.getState().lastConflictBookIds).toEqual([]);
    });

    it('reset() clears conflict state', () => {
      useSyncQueue.getState().setConflictBookIds(['x']);
      useSyncQueue.getState().reset();
      expect(useSyncQueue.getState().hadConflictLastSync).toBe(false);
      expect(useSyncQueue.getState().lastConflictBookIds).toEqual([]);
    });
  });

  it('starts with zero pending changes', () => {
    expect(useSyncQueue.getState().pendingChanges).toBe(0);
  });

  it('starts with null lastSyncedAt', () => {
    expect(useSyncQueue.getState().lastSyncedAt).toBeNull();
  });

  it('starts with flushing = false', () => {
    expect(useSyncQueue.getState().flushing).toBe(false);
  });

  it('markDirty increments pending changes', () => {
    useSyncQueue.getState().markDirty();
    expect(useSyncQueue.getState().pendingChanges).toBe(1);

    useSyncQueue.getState().markDirty();
    expect(useSyncQueue.getState().pendingChanges).toBe(2);
  });

  it('markDirty increments from any starting value', () => {
    useSyncQueue.setState({ pendingChanges: 5 });
    useSyncQueue.getState().markDirty();
    expect(useSyncQueue.getState().pendingChanges).toBe(6);
  });

  it('markSynced resets pending changes to zero', () => {
    useSyncQueue.getState().markDirty();
    useSyncQueue.getState().markDirty();
    useSyncQueue.getState().markDirty();
    expect(useSyncQueue.getState().pendingChanges).toBe(3);

    useSyncQueue.getState().markSynced();
    expect(useSyncQueue.getState().pendingChanges).toBe(0);
  });

  it('markSynced sets lastSyncedAt to a valid ISO timestamp', () => {
    useSyncQueue.getState().markSynced();
    const ts = useSyncQueue.getState().lastSyncedAt;
    expect(ts).not.toBeNull();
    expect(new Date(ts!).toISOString()).toBe(ts);
  });

  it('setFlushing updates flushing state', () => {
    useSyncQueue.getState().setFlushing(true);
    expect(useSyncQueue.getState().flushing).toBe(true);

    useSyncQueue.getState().setFlushing(false);
    expect(useSyncQueue.getState().flushing).toBe(false);
  });

  it('reset clears everything', () => {
    useSyncQueue.getState().markDirty();
    useSyncQueue.getState().markDirty();
    useSyncQueue.getState().markSynced();
    useSyncQueue.getState().setFlushing(true);

    useSyncQueue.getState().reset();

    expect(useSyncQueue.getState().pendingChanges).toBe(0);
    expect(useSyncQueue.getState().lastSyncedAt).toBeNull();
    expect(useSyncQueue.getState().flushing).toBe(false);
  });

  it('markDirty does not affect lastSyncedAt', () => {
    useSyncQueue.getState().markSynced();
    const ts = useSyncQueue.getState().lastSyncedAt;

    useSyncQueue.getState().markDirty();
    expect(useSyncQueue.getState().lastSyncedAt).toBe(ts);
  });

  it('multiple syncs update lastSyncedAt each time', async () => {
    useSyncQueue.getState().markSynced();
    const first = useSyncQueue.getState().lastSyncedAt;

    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 10));

    useSyncQueue.getState().markSynced();
    const second = useSyncQueue.getState().lastSyncedAt;

    expect(first).not.toBe(second);
    expect(new Date(second!).getTime()).toBeGreaterThan(new Date(first!).getTime());
  });

  it('markSyncFailed sets lastSyncFailedAt', () => {
    expect(useSyncQueue.getState().lastSyncFailedAt).toBeNull();
    useSyncQueue.getState().markSyncFailed();
    expect(useSyncQueue.getState().lastSyncFailedAt).not.toBeNull();
  });

  it('markSynced clears lastSyncFailedAt', () => {
    useSyncQueue.getState().markSyncFailed();
    useSyncQueue.getState().markSynced();
    expect(useSyncQueue.getState().lastSyncFailedAt).toBeNull();
  });

  it('reset clears lastSyncFailedAt', () => {
    useSyncQueue.getState().markSyncFailed();
    useSyncQueue.getState().reset();
    expect(useSyncQueue.getState().lastSyncFailedAt).toBeNull();
  });

  it('syncFailedRecently is false without a failure and after it expires', () => {
    expect(useSyncQueue.getState().syncFailedRecently()).toBe(false);
    useSyncQueue.setState({ lastSyncFailedAt: Date.now() - 120_000 });
    expect(useSyncQueue.getState().syncFailedRecently()).toBe(false);
  });

  it('syncFailedRecently is true for a recent failure', () => {
    useSyncQueue.setState({ lastSyncFailedAt: Date.now() - 1_000 });
    expect(useSyncQueue.getState().syncFailedRecently()).toBe(true);
  });

  it('saves and clears a last-good snapshot', () => {
    const books = [{ id: '1', title: 'Snap' }] as never;
    useSyncQueue.getState().saveSnapshot(books);
    expect(useSyncQueue.getState().lastGoodSnapshot).toContain('Snap');
    expect(useSyncQueue.getState().lastGoodSnapshotAt).not.toBeNull();
    useSyncQueue.getState().clearSnapshot();
    expect(useSyncQueue.getState().lastGoodSnapshot).toBeNull();
    expect(useSyncQueue.getState().lastGoodSnapshotAt).toBeNull();
  });

  it('markConflict(true) keeps existing conflict ids', () => {
    useSyncQueue.getState().setConflictBookIds(['keep']);
    useSyncQueue.getState().markConflict(true);
    expect(useSyncQueue.getState().hadConflictLastSync).toBe(true);
    expect(useSyncQueue.getState().lastConflictBookIds).toEqual(['keep']);
  });

  it('records a labeled offline queue and clears it after a successful sync', () => {
    useSyncQueue.getState().markDirty('Library edited on this device');
    expect(useSyncQueue.getState().pendingMutations).toHaveLength(1);
    expect(useSyncQueue.getState().pendingMutations[0].label).toBe('Library edited on this device');
    useSyncQueue.getState().markSynced();
    expect(useSyncQueue.getState().pendingMutations).toEqual([]);
    expect(useSyncQueue.getState().syncHistory[0].outcome).toBe('synced');
    expect(useSyncQueue.getState().syncHistory[0].pendingChanges).toBe(1);
  });

  it('records a failed sync without dropping the offline queue', () => {
    useSyncQueue.getState().markDirty('Shelves edited on this device');
    useSyncQueue.getState().markSyncFailed();
    expect(useSyncQueue.getState().pendingMutations).toHaveLength(1);
    expect(useSyncQueue.getState().syncHistory[0].outcome).toBe('failed');
  });

  it('keeps both conflict copies and resolves one book at a time', () => {
    const local = { id: 'b1', title: 'Local' } as never;
    const remote = { id: 'b1', title: 'Remote' } as never;
    useSyncQueue.getState().setBookConflicts([{ bookId: 'b1', local, remote }]);
    expect(useSyncQueue.getState().bookConflicts[0].remote.title).toBe('Remote');
    useSyncQueue.getState().resolveBookConflict('b1');
    expect(useSyncQueue.getState().hadConflictLastSync).toBe(false);
    expect(useSyncQueue.getState().bookConflicts).toEqual([]);
  });
});
