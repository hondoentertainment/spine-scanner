import { describe, it, expect } from 'vitest';
import { generateAmazonLink } from './amazonLink';

describe('generateAmazonLink', () => {
    it('generates link with ISBN as search term', () => {
        const link = generateAmazonLink('9780141036144');
        expect(link).toContain('k=9780141036144');
    });

    it('returns a valid Amazon URL', () => {
        const link = generateAmazonLink('9780141036144');
        expect(link).toMatch(/^https:\/\/www\.amazon\.com\/s\?/);
    });
});
