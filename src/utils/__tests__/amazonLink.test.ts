import { describe, it, expect } from 'vitest';
import { generateAmazonLink } from '../amazonLink';

describe('generateAmazonLink', () => {
  it('generates a link with the ISBN as search term', () => {
    const link = generateAmazonLink('9780141036144');
    expect(link).toContain('9780141036144');
    expect(link).toContain('amazon.com');
  });

  it('includes the affiliate tag', () => {
    const link = generateAmazonLink('9780141036144');
    expect(link).toContain('tag=');
  });

  it('returns a valid URL', () => {
    const link = generateAmazonLink('9780141036144');
    expect(() => new URL(link)).not.toThrow();
  });
});
