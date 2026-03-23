import { get, set, del, createStore } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';

/**
 * Custom IndexedDB-backed storage for Zustand persist middleware.
 * Uses idb-keyval for a lightweight IndexedDB wrapper.
 *
 * On first access, migrates any existing localStorage data into IndexedDB
 * and removes the localStorage keys to free space.
 *
 * Falls back to localStorage if IndexedDB is unavailable.
 */

const DB_NAME = 'spine-scanner-db';
const STORE_NAME = 'kv-store';

/** idb-keyval custom store so all keys live in one DB/object-store. */
const idbStore = /* @__PURE__ */ createStore(DB_NAME, STORE_NAME);

/** Set of keys that have already been checked for migration this session. */
const migratedKeys = new Set<string>();

/**
 * Check if IndexedDB is available and functional.
 * Returns false in environments where IDB is blocked (e.g. some private browsing modes).
 */
function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * Migrate a single key from localStorage to IndexedDB.
 * Only runs once per key per session. After migration, the localStorage
 * key is deleted to free up space.
 */
export async function migrateFromLocalStorage(key: string): Promise<void> {
  if (migratedKeys.has(key)) return;
  migratedKeys.add(key);

  try {
    // Check if data already exists in IndexedDB
    const existing = await get<string>(key, idbStore);
    if (existing != null) return;

    // Check if data exists in localStorage
    const localData = localStorage.getItem(key);
    if (localData != null) {
      await set(key, localData, idbStore);
      localStorage.removeItem(key);
    }
  } catch {
    // If migration fails, data remains in localStorage and will be
    // picked up by the fallback path on next read.
  }
}

/** localStorage-based fallback that conforms to StateStorage. */
const localStorageFallback: StateStorage = {
  getItem(name: string): string | null {
    return localStorage.getItem(name);
  },
  setItem(name: string, value: string): void {
    localStorage.setItem(name, value);
  },
  removeItem(name: string): void {
    localStorage.removeItem(name);
  },
};

/**
 * IndexedDB-backed StateStorage adapter for Zustand's persist middleware.
 * getItem / setItem / removeItem all return Promises — Zustand persist
 * supports both sync and async storage adapters.
 */
export const indexedDBStorage: StateStorage = isIndexedDBAvailable()
  ? {
      async getItem(name: string): Promise<string | null> {
        await migrateFromLocalStorage(name);
        const value = await get<string>(name, idbStore);
        return value ?? null;
      },
      async setItem(name: string, value: string): Promise<void> {
        await set(name, value, idbStore);
      },
      async removeItem(name: string): Promise<void> {
        await del(name, idbStore);
      },
    }
  : localStorageFallback;

export default indexedDBStorage;
