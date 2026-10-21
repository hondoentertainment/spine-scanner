/** Page-count delta above which two metadata sources are treated as conflicting. */
export const PAGE_COUNT_CONFLICT_THRESHOLD = 10;

export function pageCountsConflict(a: number, b: number): boolean {
  return a > 0 && b > 0 && Math.abs(a - b) > PAGE_COUNT_CONFLICT_THRESHOLD;
}

export const normalizeComparableText = (value: string): string =>
  value.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
