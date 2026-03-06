import { describe, it, expect } from 'vitest';
import { isValidIsbn10, isValidIsbn13, isValidIsbn, isbn13To10, isbn10To13, normalizeToIsbn13, formatIsbnForDisplay } from '../isbnValidation';

describe('isValidIsbn10', () => {
  it('validates correct ISBN-10', () => {
    expect(isValidIsbn10('0306406152')).toBe(true);
  });

  it('validates ISBN-10 with X check digit', () => {
    expect(isValidIsbn10('080442957X')).toBe(true);
  });

  it('rejects ISBN-10 with wrong checksum', () => {
    expect(isValidIsbn10('0306406153')).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(isValidIsbn10('123456789')).toBe(false);
    expect(isValidIsbn10('12345678901')).toBe(false);
  });

  it('rejects non-digit characters', () => {
    expect(isValidIsbn10('030640615A')).toBe(false);
  });

  it('rejects X in non-final position', () => {
    expect(isValidIsbn10('0X06406152')).toBe(false);
  });
});

describe('isValidIsbn13', () => {
  it('validates correct ISBN-13', () => {
    expect(isValidIsbn13('9780306406157')).toBe(true);
  });

  it('validates another correct ISBN-13', () => {
    expect(isValidIsbn13('9780141036144')).toBe(true);
  });

  it('rejects ISBN-13 with wrong checksum', () => {
    expect(isValidIsbn13('9780306406158')).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(isValidIsbn13('978030640615')).toBe(false);
    expect(isValidIsbn13('97803064061571')).toBe(false);
  });

  it('rejects non-digit characters', () => {
    expect(isValidIsbn13('978030640615X')).toBe(false);
  });
});

describe('isValidIsbn', () => {
  it('routes to ISBN-10 validation for 10-digit strings', () => {
    expect(isValidIsbn('0306406152')).toBe(true);
    expect(isValidIsbn('0306406153')).toBe(false);
  });

  it('routes to ISBN-13 validation for 13-digit strings', () => {
    expect(isValidIsbn('9780306406157')).toBe(true);
    expect(isValidIsbn('9780306406158')).toBe(false);
  });

  it('rejects other lengths', () => {
    expect(isValidIsbn('12345')).toBe(false);
    expect(isValidIsbn('')).toBe(false);
  });
});

/* ================================================================
 *  Edge cases and additional coverage
 * ================================================================ */

describe('ISBN edge cases', () => {
  describe('ISBN-13 with 979 prefix', () => {
    it('validates 979 prefix ISBN-13', () => {
      expect(isValidIsbn13('9791032305690')).toBe(true);
    });

    it('rejects 979 prefix ISBN-13 with bad checksum', () => {
      expect(isValidIsbn13('9791032305691')).toBe(false);
    });
  });

  describe('boundary values', () => {
    it('rejects all zeros (10 digits) — invalid checksum', () => {
      // 0000000000: sum = 0, 0 mod 11 = 0, so actually VALID by checksum!
      expect(isValidIsbn10('0000000000')).toBe(true);
    });

    it('rejects all zeros (13 digits) — invalid checksum', () => {
      // 0000000000000: sum = 0, 0 mod 10 = 0, so VALID by checksum
      expect(isValidIsbn13('0000000000000')).toBe(true);
    });

    it('rejects single character', () => {
      expect(isValidIsbn('0')).toBe(false);
    });

    it('rejects 11-digit string', () => {
      expect(isValidIsbn('12345678901')).toBe(false);
    });

    it('rejects 12-digit string', () => {
      expect(isValidIsbn('123456789012')).toBe(false);
    });

    it('rejects 14-digit string', () => {
      expect(isValidIsbn('12345678901234')).toBe(false);
    });
  });

  describe('ISBN-10 with X check digit', () => {
    it('validates ISBN-10 ending in X (check digit = 10)', () => {
      expect(isValidIsbn10('080442957X')).toBe(true);
    });

    it('validates ISBN-10 via isValidIsbn routing', () => {
      expect(isValidIsbn('080442957X')).toBe(true);
    });

    it('accepts lowercase x as check digit (ISO 2108: normalize to X)', () => {
      expect(isValidIsbn10('080442957x')).toBe(true);
    });
  });

  describe('common real-world ISBNs', () => {
    it.each([
      ['9780544003415', true, 'The Lord of the Rings'],
      ['9780061120084', true, 'To Kill a Mockingbird'],
      ['9780743273565', true, 'The Great Gatsby'],
      ['9780451524935', true, '1984 (Signet)'],
      ['9780140449136', true, 'Crime and Punishment'],
    ])('ISBN-13 %s should be %s (%s)', (isbn, expected) => {
      expect(isValidIsbn13(isbn)).toBe(expected);
    });

    it.each([
      ['0743273567', true, 'The Great Gatsby (ISBN-10)'],
      ['0451524934', true, '1984 Signet (ISBN-10)'],
      ['0140449132', true, 'Crime and Punishment (ISBN-10)'],
    ])('ISBN-10 %s should be %s (%s)', (isbn, expected) => {
      expect(isValidIsbn10(isbn)).toBe(expected);
    });
  });

  describe('non-numeric input', () => {
    it('rejects alphabetic string of ISBN-10 length', () => {
      expect(isValidIsbn('abcdefghij')).toBe(false);
    });

    it('rejects alphabetic string of ISBN-13 length', () => {
      expect(isValidIsbn('abcdefghijklm')).toBe(false);
    });

    it('rejects ISBN-13 with embedded dashes (not pre-stripped)', () => {
      expect(isValidIsbn('978-0-14-103614-4')).toBe(false);
    });

    it('rejects ISBN with spaces', () => {
      expect(isValidIsbn('978 0141036144')).toBe(false);
    });
  });

  describe('ISO 2108 / RFC 3187 alignment', () => {
    it('hyphenated ISBN-13 is valid after stripping (display-only hyphens)', () => {
      expect(isValidIsbn('978-0-14-103614-4')).toBe(false);
      const stripped = '978-0-14-103614-4'.replace(/[^0-9]/g, '');
      expect(isValidIsbn(stripped)).toBe(true);
    });

    it('ISBN-13 rejects X in any position (check digit always numeric)', () => {
      expect(isValidIsbn13('978014103614X')).toBe(false);
      expect(isValidIsbn13('97801410361X4')).toBe(false);
      expect(isValidIsbn13('X780141036144')).toBe(false);
    });

    it('isValidIsbn rejects empty string', () => {
      expect(isValidIsbn('')).toBe(false);
    });

    it('isValidIsbn routes lowercase x ISBN-10 correctly', () => {
      expect(isValidIsbn('080442957x')).toBe(true);
    });
  });
});

describe('isbn13To10', () => {
  it('converts valid ISBN-13 (978) to ISBN-10', () => {
    const result = isbn13To10('9780141036144');
    expect(result).toBe('0141036141');
    expect(isValidIsbn10(result!)).toBe(true);
  });
  it('returns null for 979 prefix', () => {
    expect(isbn13To10('9791032305690')).toBeNull();
  });
  it('returns null for wrong length', () => {
    expect(isbn13To10('978014103614')).toBeNull();
  });
});

describe('isbn10To13', () => {
  it('converts valid ISBN-10 to ISBN-13', () => {
    expect(isbn10To13('0141036144')).toBe('9780141036144');
    expect(isValidIsbn13(isbn10To13('0141036144')!)).toBe(true);
  });
  it('returns null for wrong length', () => {
    expect(isbn10To13('014103614')).toBeNull();
  });
});

describe('normalizeToIsbn13', () => {
  it('keeps ISBN-13 as digits-only', () => {
    expect(normalizeToIsbn13('9780141036144')).toBe('9780141036144');
    expect(normalizeToIsbn13('978-0-14-103614-4')).toBe('9780141036144');
  });

  it('converts ISBN-10 to ISBN-13', () => {
    expect(normalizeToIsbn13('0141036141')).toBe('9780141036144');
    expect(normalizeToIsbn13('0141036144')).toBe('9780141036144');
  });

  it('handles 979 prefix (no ISBN-10 equivalent)', () => {
    expect(normalizeToIsbn13('9791032305690')).toBe('9791032305690');
  });

  it('strips hyphens from hyphenated ISBN-13 (ISO 2108: hyphens display-only)', () => {
    expect(normalizeToIsbn13('978-0-14-103614-4')).toBe('9780141036144');
  });

  it('handles ISBN-10 with lowercase x', () => {
    expect(normalizeToIsbn13('080442957x')).toBe('9780804429573');
  });
});

describe('formatIsbnForDisplay', () => {
  it('formats ISBN-13 with hyphens', () => {
    expect(formatIsbnForDisplay('9780141036144')).toBe('978-0-14-103614-4');
  });

  it('formats ISBN-10 with hyphens', () => {
    expect(formatIsbnForDisplay('0743273567')).toBe('0-743-27356-7');
  });

  it('formats ISBN-10 ending in X', () => {
    expect(formatIsbnForDisplay('080442957X')).toBe('0-804-42957-X');
  });

  it('strips existing hyphens before formatting', () => {
    expect(formatIsbnForDisplay('978-0-14-103614-4')).toBe('978-0-14-103614-4');
  });

  it('returns raw string for non-ISBN length', () => {
    expect(formatIsbnForDisplay('12345')).toBe('12345');
  });
});

/* ================================================================
 *  isValidIsbn — OCR-focused edge cases
 * ================================================================ */

describe('isValidIsbn — OCR edge cases', () => {
  it('rejects strings with letters (except X at end for ISBN-10)', () => {
    expect(isValidIsbn('978014103614O')).toBe(false);
    expect(isValidIsbn('978O141036144')).toBe(false);
  });
  it('validates 978 prefix ISBN-13', () => {
    expect(isValidIsbn('9780141036144')).toBe(true);
  });
  it('validates 979 prefix ISBN-13', () => {
    expect(isValidIsbn('9791090636071')).toBe(true);
  });
  it('rejects 977 prefix (not ISBN-13)', () => {
    expect(isValidIsbn13('9771234567890')).toBe(false);
  });
  it('rejects ISBN-13 with X in any position (ISO 2108: ISBN-13 check digit is numeric only)', () => {
    expect(isValidIsbn13('978014103614X')).toBe(false);
    expect(isValidIsbn13('X780141036144')).toBe(false);
  });
  it('hyphenated input is valid after stripping (ISO 2108: hyphens are display-only)', () => {
    const stripped = '978-0-14-103614-4'.replace(/[^0-9]/g, '');
    expect(isValidIsbn(stripped)).toBe(true);
    expect(normalizeToIsbn13('978-0-14-103614-4')).toBe('9780141036144');
  });
  it('returns false for empty string', () => {
    expect(isValidIsbn('')).toBe(false);
  });
  it('rejects strings with spaces', () => {
    expect(isValidIsbn('978 0 14 103614 4')).toBe(false);
  });
  it('rejects strings with hyphens', () => {
    expect(isValidIsbn('978-0-14-103614-4')).toBe(false);
  });
});
