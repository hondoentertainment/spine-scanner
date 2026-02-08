import { describe, it, expect } from 'vitest';
import { extractIsbnCandidates } from '../ocr';
import { isValidIsbn, isValidIsbn13 } from '../isbnValidation';

/**
 * ─── 1. The "Double Barcode" Conflict ────────────────────────────
 *
 * Many modern books have TWO barcodes in the frame:
 *   • The ISBN-13 barcode starting with "978" (or "979")
 *   • A supplemental retail/price EAN-5 barcode starting with "5"
 *     (e.g. "52499" = $24.99 USD)
 *
 * The scanner must IGNORE the "5" prefix code and correctly identify
 * the ISBN-13 starting with "978".
 */
describe('Double Barcode Conflict', () => {
  it('prioritizes ISBN-13 (978) over a 5-prefix retail barcode in mixed text', () => {
    // Simulate OCR text where ISBN and price barcode appear on separate lines
    // (as they would after preprocessing/rotation)
    const ocrText = 'ISBN 978-0-14-312755-0\n52499';
    const candidates = extractIsbnCandidates(ocrText);

    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0]).toBe('9780143127550'); // Kafka on the Shore
    // The "52499" is too short to be an ISBN and should not appear
    expect(candidates).not.toContain('52499');
  });

  it('ignores a 13-digit string starting with "5" when a 978 ISBN is present', () => {
    // Edge case: OCR reads the supplemental barcode digits on a separate line
    const ocrText = 'ISBN 978-0-7432-7356-5\n5249900000000';
    const candidates = extractIsbnCandidates(ocrText);

    // The 978 ISBN should be first (valid ISBN-13s with 978/979 are prioritized)
    expect(candidates[0]).toMatch(/^978/);
  });

  it('handles two valid ISBN-13s on separate lines and prefers 978/979 prefix', () => {
    // Two ISBNs in frame on separate lines: one starts with 977, other with 978
    const ocrText = '9771234567003\n9780306406157';
    const candidates = extractIsbnCandidates(ocrText);

    // 978/979 should be ranked first
    expect(candidates[0]).toBe('9780306406157');
  });

  it('extracts the correct ISBN when retail barcode overlaps in OCR noise', () => {
    // Real-world OCR noise with a price barcode interleaved
    const ocrText = `
      ISBN-13: 978-0-14-028329-7
      $14.99 US / $19.99 CAN
      51499
    `;
    const candidates = extractIsbnCandidates(ocrText);

    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0]).toBe('9780140283297'); // 1984 Penguin edition
  });

  it('rejects the 5-prefix EAN as an invalid ISBN even if it is 13 digits', () => {
    // A 13-digit string starting with "5" is NOT a valid ISBN
    const fakeEan = '5249900000000';
    expect(isValidIsbn(fakeEan)).toBe(false);
    expect(isValidIsbn13(fakeEan)).toBe(false);
  });

  it('filters out short retail barcode digits from candidates', () => {
    // Price EAN (5 digits) should never appear in ISBN candidates
    const ocrText = 'ISBN: 978-0-14-103614-4\nPrice: 51499';
    const candidates = extractIsbnCandidates(ocrText);

    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0]).toBe('9780141036144');
    // All candidates should be 10 or 13 digits
    for (const c of candidates) {
      expect(c.length === 10 || c.length === 13).toBe(true);
    }
  });
});
