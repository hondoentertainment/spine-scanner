import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

/**
 * jsdom does not provide indexedDB, so storage.ts defaults to localStorageFallback.
 * To test the IndexedDB code path, we stub indexedDB before importing the storage module.
 */

// vi.hoisted runs before any imports, letting us set up indexedDB stub
// and shared mock data before the vi.mock factory and storage module load.
const { mockIdbData } = vi.hoisted(() => {
  // Stub indexedDB on globalThis so isIndexedDBAvailable() returns true
  // when the storage module evaluates.
  if (typeof globalThis.indexedDB === 'undefined') {
    // @ts-expect-error - minimal stub to pass availability check
    globalThis.indexedDB = {};
    (globalThis as Record<string, unknown>).__stubbed_indexedDB = true;
  }
  return {
    mockIdbData: {} as Record<string, string>,
  };
});

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => mockIdbData[key] ?? undefined),
  set: vi.fn(async (key: string, value: string) => {
    mockIdbData[key] = value;
  }),
  del: vi.fn(async (key: string) => {
    delete mockIdbData[key];
  }),
  createStore: vi.fn(() => ({})),
}));

import { indexedDBStorage, migrateFromLocalStorage } from '../storage';

afterAll(() => {
  // Clean up the stub if we created it
  if ((globalThis as Record<string, unknown>).__stubbed_indexedDB) {
    // @ts-expect-error - removing our stub
    delete globalThis.indexedDB;
    delete (globalThis as Record<string, unknown>).__stubbed_indexedDB;
  }
});

describe('storage (IndexedDB available)', () => {
  beforeEach(() => {
    Object.keys(mockIdbData).forEach(k => delete mockIdbData[k]);
    localStorage.clear();
  });

  describe('getItem / setItem / removeItem', () => {
    it('setItem stores a value and getItem retrieves it', async () => {
      await indexedDBStorage.setItem!('test-key', '{"data":true}');

      // Verify the value was stored in IDB mock
      expect(mockIdbData['test-key']).toBe('{"data":true}');

      const result = await indexedDBStorage.getItem!('test-key');
      expect(result).toBe('{"data":true}');
    });

    it('getItem returns null for missing key', async () => {
      const result = await indexedDBStorage.getItem!('nonexistent');
      expect(result).toBeNull();
    });

    it('removeItem deletes a value', async () => {
      mockIdbData['to-delete'] = 'value';

      await indexedDBStorage.removeItem!('to-delete');
      expect(mockIdbData['to-delete']).toBeUndefined();
    });
  });

  describe('localStorage migration', () => {
    it('migrates data from localStorage to IndexedDB on getItem', async () => {
      localStorage.setItem('fresh-migrate-key', '{"books":[]}');

      const result = await indexedDBStorage.getItem!('fresh-migrate-key');

      // localStorage key should be removed after migration
      expect(localStorage.getItem('fresh-migrate-key')).toBeNull();

      // The data should now exist in IDB
      expect(mockIdbData['fresh-migrate-key']).toBe('{"books":[]}');

      // The value should be retrievable
      expect(result).toBe('{"books":[]}');
    });

    it('does not migrate if IndexedDB already has data for the key', async () => {
      localStorage.setItem('idb-exists-key', 'old-data');
      mockIdbData['idb-exists-key'] = 'idb-data';

      await migrateFromLocalStorage('idb-exists-key');

      // localStorage should NOT have been removed (IDB already had data)
      expect(localStorage.getItem('idb-exists-key')).toBe('old-data');
    });

    it('only migrates once per key per session (migratedKeys guard)', async () => {
      localStorage.setItem('once-only-key', 'data');

      await migrateFromLocalStorage('once-only-key');

      // Data was migrated
      expect(mockIdbData['once-only-key']).toBe('data');
      expect(localStorage.getItem('once-only-key')).toBeNull();

      // Now put different data in localStorage and try again
      localStorage.setItem('once-only-key', 'data-again');
      delete mockIdbData['once-only-key'];
      await migrateFromLocalStorage('once-only-key');

      // Should NOT have migrated again (migratedKeys guard prevents it)
      expect(localStorage.getItem('once-only-key')).toBe('data-again');
      expect(mockIdbData['once-only-key']).toBeUndefined();
    });

    it('does nothing when localStorage has no data for the key', async () => {
      await migrateFromLocalStorage('no-local-data-key');
      expect(mockIdbData['no-local-data-key']).toBeUndefined();
    });
  });
});

describe('storage (IndexedDB unavailable)', () => {
  it('falls back to localStorage when indexedDB is undefined', async () => {
    const originalIndexedDB = globalThis.indexedDB;

    try {
      // @ts-expect-error - deliberately setting to undefined
      globalThis.indexedDB = undefined;

      vi.resetModules();
      vi.doMock('idb-keyval', () => ({
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
        createStore: vi.fn(() => ({})),
      }));

      const { indexedDBStorage: fallbackStorage } = await import('../storage');

      localStorage.clear();
      fallbackStorage.setItem!('fallback-key', 'fallback-value');
      expect(localStorage.getItem('fallback-key')).toBe('fallback-value');

      const result = fallbackStorage.getItem!('fallback-key');
      expect(result).toBe('fallback-value');

      fallbackStorage.removeItem!('fallback-key');
      expect(localStorage.getItem('fallback-key')).toBeNull();
    } finally {
      globalThis.indexedDB = originalIndexedDB;
    }
  });
});
