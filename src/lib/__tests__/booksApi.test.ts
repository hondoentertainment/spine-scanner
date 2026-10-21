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
      expect.objectContaining({ id: 'b1', user_id: 'user-1', isbn: '9780141036144' }),
      { onConflict: 'id' },
    );
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
