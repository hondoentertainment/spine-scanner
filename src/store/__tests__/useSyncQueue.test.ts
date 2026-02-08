import { describe, it, expect, beforeEach } from 'vitest';
import { useSyncQueue } from '../useSyncQueue';

describe('useSyncQueue', () => {
  beforeEach(() => {
    useSyncQueue.setState({
      pendingChanges: 0,
      lastSyncedAt: null,
      flushing: false,
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
});
