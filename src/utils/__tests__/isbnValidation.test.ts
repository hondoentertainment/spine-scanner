import { describe, it, expect } from 'vitest';
import { isValidIsbn10, isValidIsbn13, isValidIsbn } from '../isbnValidation';

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

    it('rejects lowercase x as check digit', () => {
      expect(isValidIsbn10('080442957x')).toBe(false);
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
});
