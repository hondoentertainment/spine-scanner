import type { MetadataLookupPayload } from '../types.ts';

const STORAGE_KEY = 'spine-metadata-lookup-cache-v1';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 100;

interface PersistedEntry {
  savedAt: number;
  payload: MetadataLookupPayload;
}

type PersistedStore = Record<string, PersistedEntry>;

function readStore(): PersistedStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: PersistedStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota or private mode — ignore */
  }
}

function pruneStore(store: PersistedStore): PersistedStore {
  const now = Date.now();
  const freshEntries = Object.entries(store).filter(([, entry]) => now - entry.savedAt <= TTL_MS);
  freshEntries.sort((a, b) => b[1].savedAt - a[1].savedAt);
  return Object.fromEntries(freshEntries.slice(0, MAX_ENTRIES));
}

export function getPersistedLookup(cacheKey: string): MetadataLookupPayload | null {
  const store = pruneStore(readStore());
  writeStore(store);
  const entry = store[cacheKey];
  if (!entry) return null;
  if (Date.now() - entry.savedAt > TTL_MS) return null;
  return entry.payload;
}

export function setPersistedLookup(cacheKey: string, payload: MetadataLookupPayload): void {
  const store = pruneStore(readStore());
  store[cacheKey] = { savedAt: Date.now(), payload };
  writeStore(pruneStore(store));
}

export function clearPersistedLookupCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
