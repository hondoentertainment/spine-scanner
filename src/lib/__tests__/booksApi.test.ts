import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { upsertUserBook } from '../../../packages/shared/src/booksApi.ts';
import type { BookEntry } from '../../types.ts';

const book: BookEntry = {
  id: 'b1',
  isbn: '9780141036144',
  title: 'Test Book',
  author: 'Test Author',
  pageCount: 200,
  amazonLink: '',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: '2026-01-15T00:00:00.000Z',
  shelfIds: [],
};

describe('upsertUserBook', () => {
  it('upserts one book row on the id conflict target', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn(() => ({ upsert })),
    } as unknown as SupabaseClient;

    await expect(upsertUserBook(client, 'user-1', book)).resolves.toBeNull();
    expect(client.from).toHaveBeenCalledWith('books');
    expect(upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'b1', user_id: 'user-1', isbn: '9780141036144' })],
      { onConflict: 'id' },
    );
  });

  it('retries without a missing migration group and does not treat loan_ledger as loan', async () => {
    const upsert = vi.fn()
      .mockResolvedValueOnce({
        error: {
          code: 'PGRST204',
          message: "Could not find the 'is_photo_only' column of 'books' in the schema cache",
        },
      })
      .mockResolvedValueOnce({
        error: {
          code: 'PGRST204',
          message: "Could not find the 'loan_ledger' column of 'books' in the schema cache",
        },
      })
      .mockResolvedValueOnce({ error: null });
    const client = {
      from: vi.fn(() => ({ upsert })),
    } as unknown as SupabaseClient;

    await expect(upsertUserBook(client, 'user-1', {
      ...book,
      loan: { borrowerName: 'Ada', lentAt: '2026-10-01T00:00:00.000Z', dueAt: null },
      locationRoom: 'Study',
    })).resolves.toBeNull();

    const first = (upsert.mock.calls[0] as [Array<Record<string, unknown>>])[0][0];
    const second = (upsert.mock.calls[1] as [Array<Record<string, unknown>>])[0][0];
    const third = (upsert.mock.calls[2] as [Array<Record<string, unknown>>])[0][0];
    expect(first.is_photo_only).toBe(false);
    expect(second.is_photo_only).toBeUndefined();
    expect(second.needs_review).toBeUndefined();
    expect(second.pages_finished).toBeUndefined();
    expect(second.loan_ledger).toEqual([
      { lentTo: 'Ada', lentAt: '2026-10-01T00:00:00.000Z', dueAt: '', returnedAt: '' },
    ]);
    expect(third.loan_ledger).toBeUndefined();
    expect(third.loan?.borrowerName).toBe('Ada');
    expect(third.location_room).toBe('Study');
    expect(third.title).toBe('Test Book');
  });

  it('returns the provider error message', async () => {
    const client = {
      from: () => ({
        upsert: vi.fn().mockResolvedValue({ error: { message: 'row level security' } }),
      }),
    } as unknown as SupabaseClient;

    await expect(upsertUserBook(client, 'user-1', book)).resolves.toEqual({
      message: 'row level security',
    });
  });
});
