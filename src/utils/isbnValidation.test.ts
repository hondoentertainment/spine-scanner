import { describe, it, expect } from 'vitest';
import { validateISBN10, validateISBN13, validateISBN } from './isbnValidation';

describe('validateISBN10', () => {
    it('validates correct ISBN-10', () => {
        expect(validateISBN10('0306406152')).toBe(true); // The C Programming Language
    });

    it('validates ISBN-10 with X check digit', () => {
        expect(validateISBN10('080442957X')).toBe(true);
    });

    it('rejects invalid ISBN-10 checksum', () => {
        expect(validateISBN10('0306406153')).toBe(false);
    });

    it('rejects wrong length', () => {
        expect(validateISBN10('123')).toBe(false);
        expect(validateISBN10('12345678901')).toBe(false);
    });

    it('rejects non-numeric characters', () => {
        expect(validateISBN10('030640615A')).toBe(false);
    });
});

describe('validateISBN13', () => {
    it('validates correct ISBN-13', () => {
        expect(validateISBN13('9780141036144')).toBe(true); // 1984 by Orwell
    });

    it('validates another correct ISBN-13', () => {
        expect(validateISBN13('9780544003415')).toBe(true); // Lord of the Rings
    });

    it('rejects invalid ISBN-13 checksum', () => {
        expect(validateISBN13('9780141036145')).toBe(false);
    });

    it('rejects wrong length', () => {
        expect(validateISBN13('978014103614')).toBe(false);
    });

    it('rejects non-numeric characters', () => {
        expect(validateISBN13('978014103614X')).toBe(false);
    });
});

describe('validateISBN', () => {
    it('validates ISBN-10', () => {
        expect(validateISBN('0306406152')).toEqual({ valid: true });
    });

    it('validates ISBN-13', () => {
        expect(validateISBN('9780141036144')).toEqual({ valid: true });
    });

    it('strips hyphens before validating', () => {
        expect(validateISBN('978-0-14-103614-4')).toEqual({ valid: true });
    });

    it('strips spaces before validating', () => {
        expect(validateISBN('978 0 14 103614 4')).toEqual({ valid: true });
    });

    it('returns error for invalid checksum', () => {
        const result = validateISBN('9780141036145');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Invalid ISBN-13 checksum');
    });

    it('returns error for wrong length', () => {
        const result = validateISBN('12345');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('ISBN must be 10 or 13 digits');
    });
});
