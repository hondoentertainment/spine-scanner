import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { advanceStreak, toLocalDateKey } from '../useBookStore.ts';
import { DEFAULT_PREFERENCES } from '../../types.ts';

const basePrefs = { ...DEFAULT_PREFERENCES };

describe('toLocalDateKey', () => {
  it('formats a date as YYYY-MM-DD using local components', () => {
    const d = new Date(2026, 4, 3, 14, 30); // May 3, 2026 14:30 local
    expect(toLocalDateKey(d)).toBe('2026-05-03');
  });

  it('zero-pads single-digit months and days', () => {
    const d = new Date(2026, 0, 5, 0, 0); // Jan 5, 2026
    expect(toLocalDateKey(d)).toBe('2026-01-05');
  });
});

describe('advanceStreak', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('treats consecutive local days as continuous regardless of UTC offset', () => {
    // Simulate user reading at 23:30 local on May 2, then 00:30 local on May 3
    // This is < 25 hours later but spans two local calendar days.
    vi.setSystemTime(new Date(2026, 4, 2, 23, 30)); // May 2, 23:30 local
    const day1 = advanceStreak(basePrefs);
    expect(day1.currentStreak).toBe(1);
    expect(day1.lastStreakDate).toBe('2026-05-02');

    vi.setSystemTime(new Date(2026, 4, 3, 0, 30)); // May 3, 00:30 local
    const day2 = advanceStreak({ ...basePrefs, ...day1 } as typeof basePrefs);
    expect(day2.currentStreak).toBe(2);
    expect(day2.lastStreakDate).toBe('2026-05-03');
    expect(day2.longestStreak).toBe(2);
  });

  it('resets the streak when a calendar day is skipped', () => {
    vi.setSystemTime(new Date(2026, 4, 1, 12, 0)); // May 1
    const day1 = advanceStreak(basePrefs);
    expect(day1.currentStreak).toBe(1);

    // Skip May 2 entirely; jump to May 3
    vi.setSystemTime(new Date(2026, 4, 3, 12, 0));
    const day2 = advanceStreak({ ...basePrefs, ...day1 } as typeof basePrefs);
    expect(day2.currentStreak).toBe(1);
    expect(day2.lastStreakDate).toBe('2026-05-03');
    // Longest still reflects whatever previous best was
    expect(day2.longestStreak).toBe(1);
  });

  it('is idempotent within the same local day', () => {
    vi.setSystemTime(new Date(2026, 4, 3, 9, 0));
    const first = advanceStreak(basePrefs);
    expect(first.currentStreak).toBe(1);

    vi.setSystemTime(new Date(2026, 4, 3, 22, 45));
    const second = advanceStreak({ ...basePrefs, ...first } as typeof basePrefs);
    // Same day → no change
    expect(second).toEqual({});
  });

  it('preserves longestStreak when current resets after a gap', () => {
    const startingPrefs = { ...basePrefs, currentStreak: 7, longestStreak: 7, lastStreakDate: '2026-04-01' };
    vi.setSystemTime(new Date(2026, 4, 3, 12, 0)); // gap of > 1 day
    const result = advanceStreak(startingPrefs);
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(7);
  });

  it('updates longestStreak when current surpasses it', () => {
    const startingPrefs = { ...basePrefs, currentStreak: 5, longestStreak: 5, lastStreakDate: '2026-05-02' };
    vi.setSystemTime(new Date(2026, 4, 3, 9, 0));
    const result = advanceStreak(startingPrefs);
    expect(result.currentStreak).toBe(6);
    expect(result.longestStreak).toBe(6);
  });
});
