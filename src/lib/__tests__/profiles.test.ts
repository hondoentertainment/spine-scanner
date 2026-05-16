import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES } from '../../types.ts';

const upsertMock = vi.fn();
const maybeSingleMock = vi.fn();
const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({
  upsert: upsertMock,
  select: selectMock,
}));

vi.mock('../supabase.ts', () => ({
  supabase: {
    from: fromMock,
  },
}));

describe('profiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes profile preferences during upsert', async () => {
    const { upsertProfile } = await import('../profiles.ts');
    const preferences = { ...DEFAULT_PREFERENCES, theme: 'light' as const, showStatsDefault: true };
    upsertMock.mockResolvedValue({ error: null });

    await expect(upsertProfile('user-1', { preferences })).resolves.toBe(true);

    expect(fromMock).toHaveBeenCalledWith('profiles');
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user-1',
        preferences,
      }),
      { onConflict: 'id' },
    );
  });

  it('merges fetched preferences with defaults', async () => {
    const { getProfile } = await import('../profiles.ts');
    maybeSingleMock.mockResolvedValue({
      data: {
        id: 'user-1',
        username: 'reader',
        display_name: null,
        avatar_url: null,
        preferences: { theme: 'system', libraryViewMode: 'list' },
        updated_at: '2026-05-16T00:00:00.000Z',
      },
      error: null,
    });

    const profile = await getProfile('user-1');

    expect(profile?.preferences).toEqual({
      ...DEFAULT_PREFERENCES,
      theme: 'system',
      libraryViewMode: 'list',
    });
  });
});
