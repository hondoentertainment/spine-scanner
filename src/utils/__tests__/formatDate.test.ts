import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatLocaleDate, formatLocaleDateTime, localDateKey, parseDisplayDate } from '../formatDate';

describe('formatDate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the local calendar day, not the UTC date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 20, 22, 30, 0));
    expect(localDateKey()).toBe('2026-10-20');
  });

  it('parses a date-only string as a local calendar day', () => {
    const parsed = parseDisplayDate('2026-10-20');
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(9);
    expect(parsed?.getDate()).toBe(20);
  });

  it('formats date-only and timestamp values with the same locale formatter', () => {
    expect(formatLocaleDate('2026-10-20')).toBe(new Date(2026, 9, 20).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }));
    expect(formatLocaleDate('')).toBe('');
    expect(formatLocaleDate('not-a-date')).toBe('');
    expect(formatLocaleDateTime('2026-10-20T15:04:00')).toContain('2026');
  });
});
