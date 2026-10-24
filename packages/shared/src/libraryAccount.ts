import type { BookEntry, Shelf } from './types';
import { normalizeBooks } from './bookState';
import { migrateBooks } from './schemaMigrations';
import { mergeBooksLists, mergeShelvesLists } from './libraryMerge';

export interface AccountLibrary {
  books: BookEntry[];
  shelves: Shelf[];
}

/** Visible library plus the copies parked for other accounts. */
export interface AccountLibraryState {
  books: BookEntry[];
  shelves: Shelf[];
  /** Account the visible books belong to. Null is a signed-out scratch list. */
  ownerId: string | null;
  librariesByAccount: Record<string, AccountLibrary>;
}

function emptyLibrary(): AccountLibrary {
  return { books: [], shelves: [] };
}

function copyLibrary(books: BookEntry[], shelves: Shelf[]): AccountLibrary {
  return { books: [...books], shelves: [...shelves] };
}

/**
 * Point the visible library at `userId`.
 * A previous account's rows are parked and are not left in the visible list.
 * Signed-out scans (ownerId null) stay visible and are adopted by the next account.
 * Passing null parks the current account and leaves an empty scratch list.
 */
export function switchLibraryAccount(state: AccountLibraryState, userId: string | null): AccountLibraryState {
  if (state.ownerId === userId) return state;

  const librariesByAccount = { ...state.librariesByAccount };
  if (state.ownerId) {
    librariesByAccount[state.ownerId] = copyLibrary(state.books, state.shelves);
  }

  if (!userId) {
    return {
      ownerId: null,
      books: [],
      shelves: [],
      librariesByAccount,
    };
  }

  const parked = librariesByAccount[userId] ?? emptyLibrary();
  delete librariesByAccount[userId];
  const unownedBooks = state.ownerId ? [] : state.books;
  const unownedShelves = state.ownerId ? [] : state.shelves;

  return {
    ownerId: userId,
    books: normalizeBooks(migrateBooks(mergeBooksLists(unownedBooks, parked.books))),
    shelves: mergeShelvesLists(unownedShelves, parked.shelves),
    librariesByAccount,
  };
}
