import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createJSONStorage } from 'zustand/middleware';
import { createLibraryStore } from '../../../packages/shared/src/libraryStore.ts';
import type { BookEntry, Shelf } from '../../types';

/**
 * In-memory stand-in for the books and shelves tables. Two library stores
 * share it the way two devices share one Supabase project. No credentials.
 */
const cloud = vi.hoisted(() => {
  type CloudRow = Record<string, unknown> & { id: string; user_id: string };
  const tables: Record<string, CloudRow[]> = { books: [], shelves: [], profiles: [] };

  function table(name: string): CloudRow[] {
    if (!tables[name]) tables[name] = [];
    return tables[name];
  }

  function from(name: string) {
    return {
      select(columns?: string) {
        return {
          eq(column: string, value: unknown) {
            const matches = table(name).filter((row) => row[column] === value);
            const data = columns === 'id'
              ? matches.map((row) => ({ id: row.id }))
              : matches.map((row) => ({ ...row }));
            const promise = Promise.resolve({ data, error: null as null });
            return Object.assign(promise, {
              order() {
                return promise;
              },
            });
          },
        };
      },
      upsert(payload: CloudRow | CloudRow[]) {
        const incoming = Array.isArray(payload) ? payload : [payload];
        const rows = table(name);
        for (const row of incoming) {
          const index = rows.findIndex((existing) => existing.id === row.id);
          if (index >= 0) rows[index] = { ...rows[index], ...row };
          else rows.push({ ...row });
        }
        return Promise.resolve({ data: null, error: null });
      },
      delete() {
        return {
          in(column: string, ids: unknown[]) {
            const drop = new Set(ids);
            tables[name] = table(name).filter((row) => !drop.has(row[column]));
            return Promise.resolve({ error: null });
          },
          eq(column: string, value: unknown) {
            tables[name] = table(name).filter((row) => row[column] !== value);
            return Promise.resolve({ error: null });
          },
        };
      },
    };
  }

  return {
    tables,
    reset() {
      tables.books = [];
      tables.shelves = [];
      tables.profiles = [];
    },
    client: { from },
  };
});

vi.mock('../supabase', () => ({
  supabase: cloud.client,
}));

import { mergeSync, pullBooks } from '../syncBooks';
import { useSyncQueue } from '../../store/useSyncQueue';

const book = (id: string, title: string, dateAdded: string): BookEntry => ({
  id,
  isbn: '9780141036144',
  title,
  author: 'Author',
  pageCount: 100,
  amazonLink: '',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded,
  shelfIds: [],
});

const shelf = (id: string, name: string): Shelf => ({
  id,
  name,
  color: '#6366f1',
});

function ids(books: { id: string }[] | null | undefined): string[] {
  return (books ?? []).map((entry) => entry.id).sort();
}

function createDevice() {
  const saved = new Map<string, string>();
  return createLibraryStore({
    storage: createJSONStorage(() => ({
      getItem: (name: string) => saved.get(name) ?? null,
      setItem: (name: string, value: string) => { saved.set(name, value); },
      removeItem: (name: string) => { saved.delete(name); },
    })),
  });
}

describe('syncBooks across devices and accounts', () => {
  beforeEach(() => {
    cloud.reset();
    localStorage.clear();
    useSyncQueue.getState().reset();
  });

  it('merges two devices, keeps device books on refresh, and leaves a parked account alone', async () => {
    const phone = createDevice();
    const laptop = createDevice();
    await phone.persist.rehydrate();
    await laptop.persist.rehydrate();

    phone.getState().claimAccount('account-a');
    phone.getState().setBooks([
      book('shared', 'Phone title', '2026-01-01T00:00:00.000Z'),
      book('phone-only', 'Only on the phone', '2026-01-02T00:00:00.000Z'),
    ]);
    phone.getState().setShelves([shelf('shelf-phone', 'Phone')]);

    const phoneFirst = await mergeSync('account-a', phone.getState().books, phone.getState().shelves);
    expect(phoneFirst).not.toBeNull();
    expect(ids(phoneFirst!.books)).toEqual(['phone-only', 'shared']);
    expect(useSyncQueue.getState().bookConflicts).toEqual([]);
    phone.getState().setBooks(phoneFirst!.books);
    phone.getState().setShelves(phoneFirst!.shelves);

    laptop.getState().claimAccount('account-a');
    laptop.getState().setBooks([
      book('shared', 'Laptop title', '2026-01-01T00:00:00.000Z'),
      book('laptop-only', 'Only on the laptop', '2026-03-01T00:00:00.000Z'),
    ]);
    laptop.getState().setShelves([shelf('shelf-laptop', 'Laptop')]);

    const laptopSync = await mergeSync('account-a', laptop.getState().books, laptop.getState().shelves);
    expect(laptopSync).not.toBeNull();
    expect(laptopSync!.books.find((entry) => entry.id === 'shared')?.title).toBe('Laptop title');
    expect(ids(laptopSync!.books)).toEqual(['laptop-only', 'phone-only', 'shared']);
    expect(ids(laptopSync!.shelves)).toEqual(['shelf-laptop', 'shelf-phone']);
    expect(useSyncQueue.getState().bookConflicts).toEqual([
      expect.objectContaining({
        bookId: 'shared',
        local: expect.objectContaining({ title: 'Laptop title' }),
        remote: expect.objectContaining({ title: 'Phone title' }),
      }),
    ]);
    expect(useSyncQueue.getState().lastGoodSnapshot).toContain('Laptop title');

    phone.getState().addBook(book('late', 'Scanned after the other device synced', '2026-05-01T00:00:00.000Z'));
    const refreshed = await mergeSync('account-a', phone.getState().books, phone.getState().shelves);
    expect(refreshed).not.toBeNull();
    expect(refreshed!.books.find((entry) => entry.id === 'shared')?.title).toBe('Phone title');
    expect(refreshed!.books.find((entry) => entry.id === 'late')?.title).toBe('Scanned after the other device synced');
    expect(ids(refreshed!.books)).toEqual(['laptop-only', 'late', 'phone-only', 'shared']);
    expect(ids(await pullBooks('account-a'))).toEqual(ids(refreshed!.books));
    expect(ids(refreshed!.shelves)).toEqual(['shelf-laptop', 'shelf-phone']);

    phone.getState().setBooks(refreshed!.books);
    phone.getState().setShelves(refreshed!.shelves);
    phone.getState().claimAccount(null);
    expect(phone.getState().books).toEqual([]);
    expect(ids(phone.getState().librariesByAccount['account-a']?.books)).toEqual(ids(refreshed!.books));

    phone.getState().addBook(book('scratch', 'Scanned while signed out', '2026-06-01T00:00:00.000Z'));
    phone.getState().claimAccount('account-b');
    expect(ids(phone.getState().books)).toEqual(['scratch']);
    expect(ids(phone.getState().librariesByAccount['account-a']?.books)).toEqual(ids(refreshed!.books));

    phone.getState().addBook(book('b-book', 'Account B', '2026-06-02T00:00:00.000Z'));
    phone.getState().setShelves([shelf('shelf-b', 'Account B')]);
    const accountB = await mergeSync('account-b', phone.getState().books, phone.getState().shelves);
    expect(accountB).not.toBeNull();
    expect(ids(accountB!.books)).toEqual(['b-book', 'scratch']);
    expect(ids(await pullBooks('account-b'))).toEqual(['b-book', 'scratch']);
    expect(ids(await pullBooks('account-a'))).toEqual(ids(refreshed!.books));
    expect(cloud.tables.shelves.filter((row) => row.user_id === 'account-a').map((row) => row.id).sort())
      .toEqual(['shelf-laptop', 'shelf-phone']);
    expect(cloud.tables.shelves.filter((row) => row.user_id === 'account-b').map((row) => row.id))
      .toEqual(['shelf-b']);

    phone.getState().setBooks(accountB!.books);
    phone.getState().setShelves(accountB!.shelves);
    phone.getState().claimAccount('account-a');
    expect(ids(phone.getState().books)).toEqual(ids(refreshed!.books));
    expect(ids(phone.getState().books)).not.toContain('b-book');
    expect(ids(phone.getState().books)).not.toContain('scratch');
    expect(ids(phone.getState().librariesByAccount['account-b']?.books)).toEqual(['b-book', 'scratch']);

    const restored = await mergeSync('account-a', phone.getState().books, phone.getState().shelves);
    expect(ids(restored!.books)).toEqual(ids(refreshed!.books));
    expect(ids(await pullBooks('account-b'))).toEqual(['b-book', 'scratch']);
  });
});