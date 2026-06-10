import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Phase 34: `deleteAllCloudData` removes all of a user's rows in the cloud.
 * We mock the Supabase client at module scope and use per-test mocks for
 * `delete().eq()` so we can simulate success and per-table failure.
 */

interface DeleteEqMock {
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
}

const tableMocks: Record<string, DeleteEqMock> = {
  books: makeTable(),
  shelves: makeTable(),
  profiles: makeTable(),
};

function makeTable(): DeleteEqMock {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const del = vi.fn(() => ({ eq }));
  return { delete: del, eq };
}

vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => ({
      delete: () => tableMocks[table].delete(),
    }),
  },
}));

vi.mock('../errorMonitoring', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

// Import AFTER the mocks so the implementation picks them up.
import { deleteAllCloudData } from '../syncBooks';
import { captureException } from '../errorMonitoring';

beforeEach(() => {
  for (const table of Object.keys(tableMocks)) {
    const fresh = makeTable();
    tableMocks[table].delete = fresh.delete;
    tableMocks[table].eq = fresh.eq;
  }
  vi.mocked(captureException).mockClear();
});

describe('deleteAllCloudData', () => {
  it('calls delete on the books, shelves, and profiles tables for the user', async () => {
    const ok = await deleteAllCloudData('user-123');

    expect(ok).toBe(true);
    expect(tableMocks.books.delete).toHaveBeenCalledTimes(1);
    expect(tableMocks.books.eq).toHaveBeenCalledWith('user_id', 'user-123');
    expect(tableMocks.shelves.delete).toHaveBeenCalledTimes(1);
    expect(tableMocks.shelves.eq).toHaveBeenCalledWith('user_id', 'user-123');
    expect(tableMocks.profiles.delete).toHaveBeenCalledTimes(1);
    // Profile uses primary key `id`, not `user_id`.
    expect(tableMocks.profiles.eq).toHaveBeenCalledWith('id', 'user-123');
  });

  it('returns true on full success', async () => {
    await expect(deleteAllCloudData('user-1')).resolves.toBe(true);
  });

  it('returns false when the books delete fails and reports the error', async () => {
    tableMocks.books.eq.mockResolvedValueOnce({ error: { message: 'books boom' } });

    const ok = await deleteAllCloudData('user-1');

    expect(ok).toBe(false);
    expect(captureException).toHaveBeenCalledOnce();
    // Once books fails we short-circuit — shelves/profiles should NOT run.
    expect(tableMocks.shelves.delete).not.toHaveBeenCalled();
    expect(tableMocks.profiles.delete).not.toHaveBeenCalled();
  });

  it('returns false when the shelves delete fails', async () => {
    tableMocks.shelves.eq.mockResolvedValueOnce({ error: { message: 'shelves boom' } });

    const ok = await deleteAllCloudData('user-1');

    expect(ok).toBe(false);
    expect(captureException).toHaveBeenCalledOnce();
    // Books succeeded; profiles must not run after shelves fails.
    expect(tableMocks.books.delete).toHaveBeenCalled();
    expect(tableMocks.profiles.delete).not.toHaveBeenCalled();
  });

  it('returns false when the profile delete fails', async () => {
    tableMocks.profiles.eq.mockResolvedValueOnce({ error: { message: 'profile boom' } });

    const ok = await deleteAllCloudData('user-1');

    expect(ok).toBe(false);
    expect(captureException).toHaveBeenCalledOnce();
    expect(tableMocks.books.delete).toHaveBeenCalled();
    expect(tableMocks.shelves.delete).toHaveBeenCalled();
  });
});
