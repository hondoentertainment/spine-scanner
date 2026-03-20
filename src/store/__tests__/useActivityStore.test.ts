import { describe, it, expect, beforeEach } from 'vitest';
import { useActivityStore } from '../useActivityStore';

describe('useActivityStore', () => {
  beforeEach(() => {
    useActivityStore.setState({ entries: [] });
  });

  it('addEntry creates an entry with id and timestamp', () => {
    useActivityStore.getState().addEntry({
      type: 'book_added',
      bookId: 'b1',
      bookTitle: 'Test Book',
    });

    const entries = useActivityStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBeDefined();
    expect(entries[0].timestamp).toBeDefined();
    expect(entries[0].type).toBe('book_added');
    expect(entries[0].bookTitle).toBe('Test Book');
  });

  it('addEntry prepends newest entries first', () => {
    useActivityStore.getState().addEntry({
      type: 'book_added',
      bookId: 'b1',
      bookTitle: 'First',
    });
    useActivityStore.getState().addEntry({
      type: 'book_finished',
      bookId: 'b2',
      bookTitle: 'Second',
    });

    const entries = useActivityStore.getState().entries;
    expect(entries[0].bookTitle).toBe('Second');
    expect(entries[1].bookTitle).toBe('First');
  });

  it('getRecentEntries respects limit', () => {
    for (let i = 0; i < 10; i++) {
      useActivityStore.getState().addEntry({
        type: 'book_added',
        bookId: `b${i}`,
        bookTitle: `Book ${i}`,
      });
    }

    expect(useActivityStore.getState().getRecentEntries(3)).toHaveLength(3);
    expect(useActivityStore.getState().getRecentEntries()).toHaveLength(10);
  });

  it('caps entries at 500 (FIFO)', () => {
    // Pre-populate with 500 entries
    const initial = Array.from({ length: 500 }, (_, i) => ({
      id: `old-${i}`,
      type: 'book_added' as const,
      bookId: `b${i}`,
      bookTitle: `Old Book ${i}`,
      timestamp: new Date(Date.now() - i * 1000).toISOString(),
    }));
    useActivityStore.setState({ entries: initial });

    // Add one more — should drop the oldest
    useActivityStore.getState().addEntry({
      type: 'book_finished',
      bookId: 'new',
      bookTitle: 'New Book',
    });

    const entries = useActivityStore.getState().entries;
    expect(entries).toHaveLength(500);
    expect(entries[0].bookTitle).toBe('New Book');
    // The very last old entry should have been dropped
    expect(entries.find((e) => e.id === 'old-499')).toBeUndefined();
  });

  it('clearAll removes all entries', () => {
    useActivityStore.getState().addEntry({
      type: 'book_added',
      bookId: 'b1',
      bookTitle: 'Test',
    });
    expect(useActivityStore.getState().entries).toHaveLength(1);

    useActivityStore.getState().clearAll();
    expect(useActivityStore.getState().entries).toHaveLength(0);
  });
});
