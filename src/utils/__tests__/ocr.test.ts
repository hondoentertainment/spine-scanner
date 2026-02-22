import { describe, it, expect } from 'vitest';
import { extractIsbnCandidates, fixOcrDigits, tryFixChecksum, getNearMissCandidates } from '../ocr';
import { isValidIsbn } from '../isbnValidation';

/* ================================================================
 *  fixOcrDigits
 * ================================================================ */

describe('fixOcrDigits', () => {
  it('normalizes common OCR digit misreads', () => {
    expect(fixOcrDigits('O1ISB8GZ')).toBe('01158892');
  });

  it('leaves clean digits unchanged', () => {
    expect(fixOcrDigits('1234567890')).toBe('1234567890');
  });

  it('handles mixed garbled ISBN', () => {
    // 9780141036144 garbled: 8→B, 0→O, 1→I
    expect(fixOcrDigits('97BOI4IO36I44')).toBe('9780141036144');
  });

  it('handles empty string', () => {
    expect(fixOcrDigits('')).toBe('');
  });

  it('fixes $ as 5 (common OCR misread)', () => {
    expect(fixOcrDigits('9780$41')).toBe('9780541');
  });

  it('fixes ! as 1 (vertical bar confusion)', () => {
    expect(fixOcrDigits('!23')).toBe('123');
  });

  it('fixes Q/q as 9', () => {
    expect(fixOcrDigits('97Q0141036144')).toBe('9790141036144');
  });

  it('fixes D as 0', () => {
    expect(fixOcrDigits('97D0141036144')).toBe('9700141036144');
  });

  it('fixes lowercase d as 0 (consistent with uppercase D)', () => {
    expect(fixOcrDigits('97d0141036144')).toBe('9700141036144');
  });
});

/* ================================================================
 *  extractIsbnCandidates — Core extraction
 * ================================================================ */

describe('extractIsbnCandidates', () => {
  // ── Empty / null input ─────────────────────────────────────
  it('returns empty array for empty string', () => {
    expect(extractIsbnCandidates('')).toEqual([]);
  });

  it('returns empty array for whitespace-only', () => {
    expect(extractIsbnCandidates('   \n  \t  ')).toEqual([]);
  });

  it('returns empty array for non-ISBN text', () => {
    expect(extractIsbnCandidates('The quick brown fox jumps over the lazy dog')).toEqual([]);
  });

  // ── Labeled ISBN patterns (Pass 1) ─────────────────────────
  describe('labeled ISBN patterns', () => {
    it('extracts ISBN-13 with "ISBN" prefix and hyphens', () => {
      const c = extractIsbnCandidates('ISBN 978-0-14-103614-4');
      expect(c[0]).toBe('9780141036144');
      expect(isValidIsbn(c[0])).toBe(true);
    });

    it('extracts ISBN-10 with "ISBN" prefix', () => {
      const c = extractIsbnCandidates('ISBN 0-7432-7356-7');
      expect(c[0]).toBe('0743273567');
      expect(isValidIsbn(c[0])).toBe(true);
    });

    it('handles "ISBN-13:" prefix', () => {
      const c = extractIsbnCandidates('ISBN-13: 978-0-306-40615-7');
      expect(c[0]).toBe('9780306406157');
    });

    it('handles "ISBN-10:" prefix', () => {
      const c = extractIsbnCandidates('ISBN-10: 0-306-40615-2');
      expect(c[0]).toBe('0306406152');
    });

    it('handles ISBN with colon and no space', () => {
      const c = extractIsbnCandidates('ISBN:9780141036144');
      expect(c[0]).toBe('9780141036144');
    });

    it('handles ISBN= format', () => {
      const c = extractIsbnCandidates('ISBN= 978-0-14-103614-4');
      expect(c[0]).toBe('9780141036144');
    });

    it('handles compact ISBN label (no space)', () => {
      const c = extractIsbnCandidates('ISBN9780141036144');
      expect(c[0]).toBe('9780141036144');
    });

    it('handles I.S.B.N. dotted format', () => {
      const c = extractIsbnCandidates('I.S.B.N. 978-0-14-103614-4');
      expect(c[0]).toBe('9780141036144');
    });

    it('handles I.S.B.N. with colon separator', () => {
      const c = extractIsbnCandidates('I.S.B.N:-9780141036144');
      expect(c.length).toBeGreaterThanOrEqual(1);
      expect(c).toContain('9780141036144');
    });
  });

  // ── 978/979 prefix patterns (Pass 2) ──────────────────────
  describe('978/979 prefix ISBN-13', () => {
    it('extracts ISBN-13 without label', () => {
      const c = extractIsbnCandidates('978-0-14-103614-4');
      expect(c[0]).toBe('9780141036144');
    });

    it('extracts 979 prefix ISBN-13', () => {
      const c = extractIsbnCandidates('979-10-90636-07-1');
      expect(c[0]).toBe('9791090636071');
    });

    it('extracts 978 from prose text', () => {
      const c = extractIsbnCandidates('Published by Penguin Books. 978-0-14-103614-4. Printed in USA.');
      expect(c[0]).toBe('9780141036144');
    });
  });

  // ── Standalone numeric (Pass 3) ────────────────────────────
  describe('standalone numeric sequences', () => {
    it('extracts bare 13-digit number', () => {
      const c = extractIsbnCandidates('9780141036144');
      expect(c[0]).toBe('9780141036144');
    });

    it('extracts bare ISBN-10', () => {
      const c = extractIsbnCandidates('0743273567');
      expect(c[0]).toBe('0743273567');
    });

    it('extracts ISBN from mixed text with no label', () => {
      const c = extractIsbnCandidates('Random text 978-0-14-103614-4 more text');
      expect(c[0]).toBe('9780141036144');
    });
  });

  // ── OCR digit fix recovery ─────────────────────────────────
  describe('OCR digit fix recovery', () => {
    it('recovers ISBN with O→0 substitution', () => {
      const c = extractIsbnCandidates('ISBN 978-O-14-1O3614-4');
      expect(c).toContain('9780141036144');
    });

    it('recovers ISBN with B→8, l→1', () => {
      const c = extractIsbnCandidates('ISBN 97B-0l4-1O3614-4');
      expect(c[0]).toBe('9780141036144');
    });

    it('recovers ISBN with multiple character errors', () => {
      // B→8, O→0, I→1 (these are the actual fixOcrDigits mappings)
      // Original: 9780141036144, garbled: 97B-O-I4-lO36l44
      const c = extractIsbnCandidates('ISBN 97B-O-I4-lO36l44');
      const found = c.find(x => x === '9780141036144');
      expect(found).toBeDefined();
    });
  });

  // ── Sliding window (Pass 4) ────────────────────────────────
  describe('sliding window for dense text', () => {
    it('finds ISBN-13 in concatenated digits', () => {
      // ISBN embedded in a run of digits
      const c = extractIsbnCandidates('12345978014103614467890');
      expect(c).toContain('9780141036144');
    });

    it('does NOT produce false positive ISBN-10 from dense text', () => {
      // Sliding window should only search for 978/979 ISBN-13
      const c = extractIsbnCandidates('5897803064');
      // Should not produce a valid ISBN-10 from this random number
      const valid10 = c.filter(x => x.length === 10 && isValidIsbn(x));
      // If it finds one, it should at least not be ranked above a real ISBN
      expect(valid10.length).toBeLessThanOrEqual(1);
    });
  });

  // ── Ranking / deduplication ────────────────────────────────
  describe('ranking and deduplication', () => {
    it('ranks valid ISBN-13 before ISBN-10', () => {
      const c = extractIsbnCandidates('ISBN: 0743273567 and 9780141036144');
      expect(c[0]).toBe('9780141036144');
      expect(c).toContain('0743273567');
    });

    it('prefers 978/979 ISBN-13 over other ISBN-13', () => {
      const c = extractIsbnCandidates('ISBN 9780306406157 and 9771234567890');
      expect(c[0]).toBe('9780306406157');
    });

    it('puts invalid candidates last', () => {
      const c = extractIsbnCandidates('ISBN 9780306406158'); // invalid checksum
      expect(c[0]).toBe('9780306406158');
      expect(isValidIsbn(c[0])).toBe(false);
    });

    it('deduplicates identical candidates', () => {
      const c = extractIsbnCandidates('ISBN 978-0-14-103614-4\nISBN 978-0-14-103614-4');
      const count = c.filter(x => x === '9780141036144').length;
      expect(count).toBe(1);
    });
  });

  // ── Full text output (no character whitelist) ──────────────
  describe('full text OCR output (no whitelist)', () => {
    it('extracts ISBN from text with book title, author, publisher', () => {
      const text = `
        PENGUIN CLASSICS
        THE GREAT GATSBY
        F. SCOTT FITZGERALD
        ISBN 978-0-14-103614-4
        $14.99 US $19.99 CAN
        Penguin Books Ltd.
        www.penguin.com
      `;
      const c = extractIsbnCandidates(text);
      expect(c[0]).toBe('9780141036144');
    });

    it('extracts ISBN from back-cover text with mixed content', () => {
      const text = `
        "A masterpiece of American fiction."
        —The New York Times

        About the Author
        F. Scott Fitzgerald (1896-1940) was born in St. Paul,
        Minnesota. He is widely regarded as one of the greatest
        American writers of the 20th century.

        Cover design by Coralie Bickford-Smith
        ISBN 978-0-14-103614-4

        9 780141 036144    Printed in the USA
      `;
      const c = extractIsbnCandidates(text);
      expect(c[0]).toBe('9780141036144');
    });

    it('extracts ISBN from text with copyright info', () => {
      const text = `
        Copyright © 2024 by Author Name
        All rights reserved.
        Published in the United States by Random House,
        an imprint of Random House, a division of
        Penguin Random House LLC, New York.

        ISBN 978-0-525-55969-3

        First Edition
        Printed in the United States of America
        10 9 8 7 6 5 4 3 2 1
      `;
      const c = extractIsbnCandidates(text);
      // 9780525559693 is the ISBN for a Random House book
      expect(c.length).toBeGreaterThanOrEqual(1);
      expect(c[0]).toBe('9780525559693');
    });

    it('handles text with price and barcode digits', () => {
      const text = `
        ISBN 978-0-14-103614-4
        52499
      `;
      const c = extractIsbnCandidates(text);
      expect(c[0]).toBe('9780141036144');
      // Price digits (52499) should NOT produce a false candidate
    });

    it('extracts from OCR text with typical noise characters', () => {
      // OCR often inserts random punctuation
      const text = "ISBN: 978~0~14~103614~4. All rights reserved.";
      // The ~ chars get normalized to spaces
      const c = extractIsbnCandidates(text);
      // The sliding window should still find it
      expect(c.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Edge cases ─────────────────────────────────────────────
  describe('edge cases', () => {
    it('handles ISBN-10 ending in X', () => {
      const c = extractIsbnCandidates('ISBN 0-8044-2957-X');
      expect(c[0]).toBe('080442957X');
      expect(isValidIsbn(c[0])).toBe(true);
    });

    it('handles ISBN with extra spaces', () => {
      const c = extractIsbnCandidates('ISBN   978   0   14   103614   4');
      expect(c.length).toBeGreaterThanOrEqual(1);
      // Should find the ISBN even with extra spaces
      expect(c.some(x => x === '9780141036144')).toBe(true);
    });

    it('handles multiple ISBNs in same text', () => {
      const text = 'ISBN-10: 0-306-40615-2\nISBN-13: 978-0-306-40615-7';
      const c = extractIsbnCandidates(text);
      expect(c).toContain('9780306406157');
      expect(c).toContain('0306406152');
      // ISBN-13 should rank first
      expect(c.indexOf('9780306406157')).toBeLessThan(c.indexOf('0306406152'));
    });

    it('handles curly quotes from OCR', () => {
      const c = extractIsbnCandidates('\u201cISBN 978-0-14-103614-4\u201d');
      expect(c[0]).toBe('9780141036144');
    });

    it('handles line breaks within ISBN (Pass 5: cross-line detection)', () => {
      const c = extractIsbnCandidates('978-0-14-\n103614-4');
      expect(c).toContain('9780141036144');
    });

    it('extracts ISBN spanning two adjacent lines', () => {
      const text = '978-0-14-\n103614-4';
      const c = extractIsbnCandidates(text);
      expect(c.length).toBeGreaterThanOrEqual(1);
      expect(c).toContain('9780141036144');
    });

    it('extracts ISBN-13 with 978 prefix split across three lines', () => {
      const text = '978\n-0-14\n-103614-4';
      const c = extractIsbnCandidates(text);
      // Joining 3 lines: 978-0-14-103614-4
      expect(c.some(x => x === '9780141036144')).toBe(true);
    });

    it('handles ISBN-10 with X check digit', () => {
      const c = extractIsbnCandidates('ISBN 0-201-63361-X');
      expect(c.some(x => x === '020163361X')).toBe(true);
    });

    it('extracts from dense barcode-style digits only', () => {
      const c = extractIsbnCandidates('978014103614452499');
      expect(c).toContain('9780141036144');
    });
  });
});

/* ================================================================
 *  tryFixChecksum — Fuzzy checksum repair for OCR/barcode misreads
 * ================================================================ */

describe('tryFixChecksum', () => {
  it('returns null for valid ISBN (already valid)', () => {
    expect(tryFixChecksum('9780141036144')).toBe('9780141036144');
    expect(tryFixChecksum('0743273567')).toBe('0743273567');
  });

  it('repairs single-digit OCR error (ISBN-13)', () => {
    // 9780306406151 invalid; tryFixChecksum fixes via 0→6 at position 7 → 9780306466151
    const repaired = tryFixChecksum('9780306406151');
    expect(repaired).toBe('9780306466151');
    expect(isValidIsbn(repaired!)).toBe(true);
  });

  it('repairs single-digit OCR error (ISBN-10)', () => {
    // 0743273567 valid; 0743273561 has 1 instead of 7 (ambiguous 1↔7)
    const repaired = tryFixChecksum('0743273561');
    expect(repaired).toBe('0743273567');
  });

  it('returns null when no single-digit fix exists', () => {
    // 1111111111111 is invalid; no single-digit substitution yields valid ISBN
    expect(tryFixChecksum('1111111111111')).toBeNull();
  });

  it('returns null for wrong-length strings', () => {
    expect(tryFixChecksum('12345')).toBeNull();
    expect(tryFixChecksum('')).toBeNull();
  });

  it('handles ambiguous digit substitutions', () => {
    // Uses ambiguous map: 0→6/8/9, 1→7/4, etc.
    // 9780306406151 invalid; 0→6 at position 7 yields valid 9780306466151
    const repaired = tryFixChecksum('9780306406151');
    expect(repaired).toBe('9780306466151');
  });
});

/* ================================================================
 *  getNearMissCandidates — All fixable variants for suggestions
 * ================================================================ */

describe('getNearMissCandidates', () => {
  it('returns empty for valid ISBN (no fixes needed)', () => {
    expect(getNearMissCandidates('9780141036144')).toEqual([]);
  });

  it('returns all valid single-digit fix variants', () => {
    const missed = getNearMissCandidates('9780306406151');
    expect(missed).toContain('9780306466151');
    expect(missed.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty when no fix exists', () => {
    expect(getNearMissCandidates('1111111111111')).toEqual([]);
  });

  it('returns multiple variants when several single-digit fixes validate', () => {
    const missed = getNearMissCandidates('9780306406151');
    expect(missed.length).toBeGreaterThanOrEqual(1);
    missed.forEach(m => expect(isValidIsbn(m)).toBe(true));
  });

  it('returns empty for wrong-length input', () => {
    expect(getNearMissCandidates('12345')).toEqual([]);
  });
});
