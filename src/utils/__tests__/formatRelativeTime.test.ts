import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeTime } from '../formatRelativeTime';

describe('formatRelativeTime', () => {
  const now = 1_000_000_000_000; // fixed timestamp

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty string for null', () => {
    expect(formatRelativeTime(null)).toBe('');
  });

  it('returns "just now" for times within 15 seconds', () => {
    expect(formatRelativeTime(new Date(now - 5000).toISOString())).toBe('just now');
    expect(formatRelativeTime(new Date(now - 14_000).toISOString())).toBe('just now');
  });

  it('returns "Xs ago" for times within 1 minute', () => {
    expect(formatRelativeTime(new Date(now - 20_000).toISOString())).toBe('20s ago');
    expect(formatRelativeTime(new Date(now - 59_000).toISOString())).toBe('59s ago');
  });

  it('returns "Xm ago" for times within 1 hour', () => {
    expect(formatRelativeTime(new Date(now - 60_000).toISOString())).toBe('1m ago');
    expect(formatRelativeTime(new Date(now - 120_000).toISOString())).toBe('2m ago');
    expect(formatRelativeTime(new Date(now - 59 * 60_000).toISOString())).toBe('59m ago');
  });

  it('returns "Xh ago" for times within 24 hours', () => {
    expect(formatRelativeTime(new Date(now - 60 * 60_000).toISOString())).toBe('1h ago');
    expect(formatRelativeTime(new Date(now - 2 * 60 * 60_000).toISOString())).toBe('2h ago');
  });

  it('returns "Xd ago" for older times', () => {
    expect(formatRelativeTime(new Date(now - 24 * 60 * 60_000).toISOString())).toBe('1d ago');
    expect(formatRelativeTime(new Date(now - 48 * 60 * 60_000).toISOString())).toBe('2d ago');
  });
});
