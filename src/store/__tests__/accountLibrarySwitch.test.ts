import { describe, expect, it, vi } from 'vitest';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createJSONStorage } from 'zustand/middleware';
import { createAuthStore } from '../../../packages/shared/src/authStore.ts';
import { createLibraryStore } from '../../../packages/shared/src/libraryStore.ts';
import { mergePulledLibrary } from '../../../packages/shared/src/libraryMerge.ts';
import type { BookEntry, Shelf } from '../../types';

const book = (id: string, title: string): BookEntry => ({
  id,
  isbn: '9780141036144',
  title,
  author: 'Author',
  pageCount: 100,
  amazonLink: '',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: '2026-02-01T00:00:00.000Z',
  shelfIds: [],
});

const shelf = (id: string, name: string): Shelf => ({
  id,
  name,
  color: '#6366f1',
});

function sessionFor(id: string, email: string): Session {
  return { user: { id, email } } as Session;
}

function clientFor(session: Session) {
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    }),
    signInWithPassword: vi.fn().mockResolvedValue({
      data: { session, user: session.user },
      error: null,
    }),
    signUp: vi.fn(),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };
  return { auth } as unknown as SupabaseClient;
}

function memoryStorage() {
  const saved = new Map<string, string>();
  return {
    getItem: (name: string) => saved.get(name) ?? null,
    setItem: (name: string, value: string) => { saved.set(name, value); },
    removeItem: (name: string) => { saved.delete(name); },
  };
}

describe('account library switch', () => {
  it('does not merge or upload account A into account B after sign-out', async () => {
    const library = createLibraryStore({
      storage: createJSONStorage(memoryStorage),
    });
    const accountA = sessionFor('account-a', 'a@example.com');
    const accountB = sessionFor('account-b', 'b@example.com');
    const auth = createAuthStore(() => clientFor(accountA), {
      onAccountChange: (userId) => library.getState().claimAccount(userId),
    });

    await auth.getState().signIn('a@example.com', 'secret');
    library.getState().setBooks([book('book-a', 'Account A')]);
    library.getState().setShelves([shelf('shelf-a', 'Account A')]);

    await auth.getState().signOut();
    expect(library.getState().books).toEqual([]);
    expect(library.getState().librariesByAccount['account-a']?.books.map((entry) => entry.id)).toEqual(['book-a']);

    library.getState().addBook({
      ...book('device-only', 'Scanned while signed out'),
      dateAdded: '2026-02-02T00:00:00.000Z',
    });

    const authB = createAuthStore(() => clientFor(accountB), {
      onAccountChange: (userId) => library.getState().claimAccount(userId),
    });
    await authB.getState().signIn('b@example.com', 'secret');
    library.getState().addBook({
      ...book('device-b', 'Scanned as B'),
      dateAdded: '2026-02-03T00:00:00.000Z',
    });

    library.getState().claimAccount('account-b');
    const localBooks = library.getState().books;
    const localShelves = library.getState().shelves;
    const merged = mergePulledLibrary(
      localBooks,
      [{ ...book('book-b', 'From B cloud'), dateAdded: '2026-03-01T00:00:00.000Z' }],
      localShelves,
      [shelf('shelf-b', 'From B cloud')],
    );

    expect(localBooks.map((entry) => entry.id)).not.toContain('book-a');
    expect(merged.books.map((entry) => entry.id)).toEqual(['book-b', 'device-b', 'device-only']);
    expect(merged.shelves.map((entry) => entry.id)).not.toContain('shelf-a');
    expect(merged.shelves.map((entry) => entry.id)).toContain('shelf-b');
    expect(library.getState().librariesByAccount['account-a']?.books.map((entry) => entry.id)).toEqual(['book-a']);
    expect(library.getState().librariesByAccount['account-a']?.shelves.map((entry) => entry.id)).toEqual(['shelf-a']);

    await authB.getState().signOut();
    await auth.getState().signIn('a@example.com', 'secret');
    expect(library.getState().books.map((entry) => entry.id)).toEqual(['book-a']);
    expect(library.getState().books.map((entry) => entry.id)).not.toContain('device-b');
    expect(library.getState().books.map((entry) => entry.id)).not.toContain('book-b');
  });
});
