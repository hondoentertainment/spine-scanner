import { describe, expect, it } from 'vitest';
import { pluralize } from '../plural';

describe('pluralize', () => {
  it('uses the singular for one and the plural otherwise', () => {
    expect(pluralize(1, 'book')).toBe('1 book');
    expect(pluralize(0, 'book')).toBe('0 books');
    expect(pluralize(3, 'book')).toBe('3 books');
    expect(pluralize(2, 'change')).toBe('2 changes');
  });
});
