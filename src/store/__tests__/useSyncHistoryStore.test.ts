import { describe, it, expect, beforeEach } from 'vitest';
import { useSyncHistoryStore, type SyncHistoryEntry } from '../useSyncHistoryStore';

function makeEntry(overrides: Partial<SyncHistoryEntry> = {}): SyncHistoryEntry {
  return {
    id: `entry-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    direction: 'merge',
    status: 'success',
    booksChanged: 3,
    shelvesChanged: 1,
    conflictsResolved: 0,
    duration: 150,
    ...overrides,
  };
}

describe('useSyncHistoryStore', () => {
  beforeEach(() => {
    useSyncHistoryStore.setState({
      history: [],
      lastGoodSnapshot: null,
    });
  });

  it('starts with empty history', () => {
    expect(useSyncHistoryStore.getState().history).toEqual([]);
  });

  it('addEntry adds an entry to the front of history', () => {
    const entry = makeEntry({ id: 'first' });
    useSyncHistoryStore.getState().addEntry(entry);
    expect(useSyncHistoryStore.getState().history).toHaveLength(1);
    expect(useSyncHistoryStore.getState().history[0].id).toBe('first');
  });

  it('addEntry prepends newer entries', () => {
    const e1 = makeEntry({ id: 'older' });
    const e2 = makeEntry({ id: 'newer' });
    useSyncHistoryStore.getState().addEntry(e1);
    useSyncHistoryStore.getState().addEntry(e2);
    expect(useSyncHistoryStore.getState().history[0].id).toBe('newer');
    expect(useSyncHistoryStore.getState().history[1].id).toBe('older');
  });

  it('getRecent returns limited entries', () => {
    for (let i = 0; i < 20; i++) {
      useSyncHistoryStore.getState().addEntry(makeEntry({ id: `e-${i}` }));
    }
    const recent5 = useSyncHistoryStore.getState().getRecent(5);
    expect(recent5).toHaveLength(5);
  });

  it('getRecent defaults to 10', () => {
    for (let i = 0; i < 20; i++) {
      useSyncHistoryStore.getState().addEntry(makeEntry({ id: `e-${i}` }));
    }
    const recent = useSyncHistoryStore.getState().getRecent();
    expect(recent).toHaveLength(10);
  });

  it('caps history at 100 entries', () => {
    for (let i = 0; i < 110; i++) {
      useSyncHistoryStore.getState().addEntry(makeEntry({ id: `e-${i}` }));
    }
    expect(useSyncHistoryStore.getState().history).toHaveLength(100);
    // The most recent entry should be the last one added
    expect(useSyncHistoryStore.getState().history[0].id).toBe('e-109');
  });

  it('clearHistory empties history and snapshot', () => {
    useSyncHistoryStore.getState().addEntry(makeEntry());
    useSyncHistoryStore.getState().saveSnapshot('[]', '[]');
    useSyncHistoryStore.getState().clearHistory();
    expect(useSyncHistoryStore.getState().history).toEqual([]);
    expect(useSyncHistoryStore.getState().lastGoodSnapshot).toBeNull();
  });

  it('saveSnapshot stores books and shelves with timestamp', () => {
    const books = JSON.stringify([{ id: 'b1' }]);
    const shelves = JSON.stringify([{ id: 's1' }]);
    useSyncHistoryStore.getState().saveSnapshot(books, shelves);
    const snapshot = useSyncHistoryStore.getState().lastGoodSnapshot;
    expect(snapshot).not.toBeNull();
    expect(snapshot!.books).toBe(books);
    expect(snapshot!.shelves).toBe(shelves);
    expect(new Date(snapshot!.timestamp).toISOString()).toBe(snapshot!.timestamp);
  });

  it('getSnapshot returns null when no snapshot saved', () => {
    expect(useSyncHistoryStore.getState().getSnapshot()).toBeNull();
  });

  it('getSnapshot returns the saved snapshot', () => {
    useSyncHistoryStore.getState().saveSnapshot('books-json', 'shelves-json');
    const snapshot = useSyncHistoryStore.getState().getSnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot!.books).toBe('books-json');
    expect(snapshot!.shelves).toBe('shelves-json');
  });

  it('saveSnapshot overwrites previous snapshot', () => {
    useSyncHistoryStore.getState().saveSnapshot('old-books', 'old-shelves');
    useSyncHistoryStore.getState().saveSnapshot('new-books', 'new-shelves');
    const snapshot = useSyncHistoryStore.getState().getSnapshot();
    expect(snapshot!.books).toBe('new-books');
    expect(snapshot!.shelves).toBe('new-shelves');
  });

  it('preserves entry data fields correctly', () => {
    const entry = makeEntry({
      id: 'test-entry',
      direction: 'push',
      status: 'failed',
      booksChanged: 5,
      shelvesChanged: 2,
      conflictsResolved: 1,
      errorMessage: 'Network error',
      duration: 3200,
    });
    useSyncHistoryStore.getState().addEntry(entry);
    const stored = useSyncHistoryStore.getState().history[0];
    expect(stored.direction).toBe('push');
    expect(stored.status).toBe('failed');
    expect(stored.booksChanged).toBe(5);
    expect(stored.shelvesChanged).toBe(2);
    expect(stored.conflictsResolved).toBe(1);
    expect(stored.errorMessage).toBe('Network error');
    expect(stored.duration).toBe(3200);
  });
});
