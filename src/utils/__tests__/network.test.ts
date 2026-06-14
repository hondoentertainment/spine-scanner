import { describe, it, expect } from 'vitest';
import { isOnline, offlineMetadataMessage, parseOptionalPageCount } from '../network.ts';

describe('network helpers', () => {
  it('returns null for invalid page filter input', () => {
    expect(parseOptionalPageCount('')).toBeNull();
    expect(parseOptionalPageCount('abc')).toBeNull();
  });

  it('parses valid page counts', () => {
    expect(parseOptionalPageCount('250')).toBe(250);
  });

  it('reports online status from navigator', () => {
    expect(typeof isOnline()).toBe('boolean');
  });

  it('provides offline metadata guidance', () => {
    expect(offlineMetadataMessage()).toMatch(/offline/i);
  });
});
