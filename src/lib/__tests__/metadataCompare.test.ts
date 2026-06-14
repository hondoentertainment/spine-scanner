import { describe, it, expect } from 'vitest';
import { pageCountsConflict } from '../metadataCompare.ts';

describe('pageCountsConflict', () => {
  it('returns false for small differences within threshold', () => {
    expect(pageCountsConflict(300, 305)).toBe(false);
  });

  it('returns true when both counts are positive and differ beyond threshold', () => {
    expect(pageCountsConflict(300, 320)).toBe(true);
  });

  it('returns false when either count is zero', () => {
    expect(pageCountsConflict(0, 320)).toBe(false);
  });
});
