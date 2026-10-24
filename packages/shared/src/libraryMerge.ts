import type { BookEntry, Shelf } from './types';
import { migrateBooks } from './schemaMigrations';

/**
 * Merge two book lists: combine all unique IDs, local wins on conflict.
 * This is a pure function — useful for testing independently of Supabase.
 */
export function mergeBooksLists(localBooks: BookEntry[], remoteBooks: BookEntry[]): BookEntry[] {
  const remoteMap = new Map(remoteBooks.map((b) => [b.id, b]));
  const localMap = new Map(localBooks.map((b) => [b.id, b]));

  const allIds = new Set([...remoteMap.keys(), ...localMap.keys()]);
  const merged: BookEntry[] = [];

  for (const id of allIds) {
    const local = localMap.get(id);
    const remote = remoteMap.get(id);

    if (local) {
      merged.push(local);
    } else if (remote) {
      merged.push(remote);
    }
  }

  merged.sort((a, b) => b.dateAdded.localeCompare(a.dateAdded));
  return merged;
}

/** Merge two shelf lists: local wins on conflict. */
export function mergeShelvesLists(localShelves: Shelf[], remoteShelves: Shelf[]): Shelf[] {
  const remoteMap = new Map(remoteShelves.map((s) => [s.id, s]));
  const localMap = new Map(localShelves.map((s) => [s.id, s]));

  const allIds = new Set([...remoteMap.keys(), ...localMap.keys()]);
  const merged: Shelf[] = [];

  for (const id of allIds) {
    const local = localMap.get(id);
    const remote = remoteMap.get(id);

    if (local) {
      merged.push(local);
    } else if (remote) {
      merged.push(remote);
    }
  }

  return merged;
}

/**
 * Union of the device library and a cloud pull.
 * The device copy wins when the same id is in both.
 * Cloud rows the device does not have are kept. Nothing is deleted.
 */
export function mergePulledLibrary(
  localBooks: BookEntry[],
  remoteBooks: BookEntry[],
  localShelves: Shelf[],
  remoteShelves: Shelf[],
): { books: BookEntry[]; shelves: Shelf[] } {
  return {
    books: migrateBooks(mergeBooksLists(localBooks, remoteBooks)),
    shelves: mergeShelvesLists(localShelves, remoteShelves),
  };
}
