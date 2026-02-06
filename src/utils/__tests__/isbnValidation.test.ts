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
