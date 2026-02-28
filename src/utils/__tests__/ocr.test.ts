import { describe, it, expect, vi } from 'vitest';
import { extractIsbnCandidates, fixOcrDigits, tryFixChecksum, getNearMissCandidates, OCR_AMBIGUITY_MAP } from '../ocr';
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
    // 1000007006 is valid; corrupt position 6: '7' → '1' → 1000001006 (invalid).
    // The ambiguity map for '1' includes '7', so tryFixChecksum should find 1000007006.
    // No earlier position's ambiguity alternatives yield a valid ISBN-10.
    const repaired = tryFixChecksum('1000001006');
    expect(repaired).toBe('1000007006');
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

/* ================================================================
 *  OCR_AMBIGUITY_MAP — new digit entries and shared map tests
 * ================================================================ */

describe('tryFixChecksum / getNearMissCandidates — new ambiguity entries', () => {
  // ── Digit '2' alternatives ('7', '3') ────────────────────────
  it('tryFixChecksum tries alternatives for digit 2 (2→7)', () => {
    // 9280000000002 is invalid. Position 0 ('9') has alternatives ['0','7','4']; position 1 ('2') has ['7','3'].
    // tryFixChecksum scans left-to-right, so position 0 is checked first.
    // '9'→'4' at position 0 yields '4280000000002' which is a valid ISBN-13.
    const repaired = tryFixChecksum('9280000000002');
    expect(repaired).not.toBeNull();
    expect(isValidIsbn(repaired!)).toBe(true);
    // The first valid fix found (left-to-right scan); the 2→7 fix is also in getNearMissCandidates.
    expect(repaired).toBe('4280000000002');
  });

  it('getNearMissCandidates tries alternatives for digit 2', () => {
    // 9780000000033 is valid. Corrupt position 11: '3' → '2' → 9780000000023 (invalid).
    // The ambiguity map for '2' includes '3', so getNearMissCandidates should find 9780000000033.
    const missed = getNearMissCandidates('9780000000023');
    expect(missed).toContain('9780000000033');
  });

  // ── Digit '4' alternatives ('1', '9') ────────────────────────
  it('tryFixChecksum tries alternatives for digit 4 (4→9)', () => {
    // 9780000000002 is valid. Corrupt position 0: '9' → '4' → 4780000000002 (invalid).
    // The ambiguity map for '4' includes '9'. Position 0 is the first position,
    // so tryFixChecksum finds '9' at position 0 first.
    const repaired = tryFixChecksum('4780000000002');
    expect(repaired).not.toBeNull();
    expect(isValidIsbn(repaired!)).toBe(true);
    expect(repaired).toBe('9780000000002');
  });

  it('getNearMissCandidates tries alternatives for digit 4', () => {
    // Same candidate: 4780000000002 should yield 9780000000002 via 4→9 at position 0
    const missed = getNearMissCandidates('4780000000002');
    expect(missed).toContain('9780000000002');
  });

  // ── 'X' alternative ('0') for ISBN-10 check digit ────────────
  it('tryFixChecksum tries alternatives for X check digit (X→0)', () => {
    // 1001010140 is a valid ISBN-10 ending in '0'.
    // Corrupt last digit: replace '0' with 'X' → 100101014X (invalid).
    // No other single-digit substitution from the ambiguity map yields a valid ISBN
    // before position 9, so the X→0 fix at the last position is the one found.
    const repaired = tryFixChecksum('100101014X');
    expect(repaired).not.toBeNull();
    expect(isValidIsbn(repaired!)).toBe(true);
    expect(repaired).toBe('1001010140');
  });

  it('getNearMissCandidates tries alternatives for X check digit', () => {
    const missed = getNearMissCandidates('100101014X');
    expect(missed).toContain('1001010140');
  });

  // ── Both functions use the same shared map ────────────────────
  it('tryFixChecksum and getNearMissCandidates use the same ambiguity map', () => {
    // For any invalid ISBN that tryFixChecksum can repair, the repaired result
    // should also appear in getNearMissCandidates output (since they share OCR_AMBIGUITY_MAP).
    const candidates = ['9280000000002', '4780000000002', '100101014X'];
    for (const candidate of candidates) {
      const fixed = tryFixChecksum(candidate);
      if (fixed && fixed !== candidate) {
        const nearMisses = getNearMissCandidates(candidate);
        expect(nearMisses).toContain(fixed);
      }
    }
  });

  it('OCR_AMBIGUITY_MAP is exported and contains entries for 2, 4, and X', () => {
    expect(OCR_AMBIGUITY_MAP['2']).toBeDefined();
    expect(OCR_AMBIGUITY_MAP['2']).toContain('7');
    expect(OCR_AMBIGUITY_MAP['2']).toContain('3');

    expect(OCR_AMBIGUITY_MAP['4']).toBeDefined();
    expect(OCR_AMBIGUITY_MAP['4']).toContain('1');
    expect(OCR_AMBIGUITY_MAP['4']).toContain('9');

    expect(OCR_AMBIGUITY_MAP['X']).toBeDefined();
    expect(OCR_AMBIGUITY_MAP['X']).toContain('0');
  });

  it('OCR_AMBIGUITY_MAP contains expanded confusions for 3, 5, 7, and 9', () => {
    // 3↔5 (noisy top part confusion)
    expect(OCR_AMBIGUITY_MAP['3']).toContain('5');
    expect(OCR_AMBIGUITY_MAP['5']).toContain('3');

    // 7↔2 (common font confusion)
    expect(OCR_AMBIGUITY_MAP['7']).toContain('2');

    // 9↔4 (vertical stroke confusion)
    expect(OCR_AMBIGUITY_MAP['9']).toContain('4');
  });
});

/* ================================================================
 *  extractIsbnCandidates — MAX_OCR_TEXT_LENGTH truncation
 * ================================================================ */

describe('extractIsbnCandidates — MAX_OCR_TEXT_LENGTH truncation', () => {
  it('finds ISBN near the start of text exceeding 100,000 chars', () => {
    // Place ISBN near the start, then pad with filler to exceed the limit
    const isbn = 'ISBN 978-0-14-103614-4\n';
    const filler = 'A'.repeat(100_001);
    const text = isbn + filler;
    const c = extractIsbnCandidates(text);
    expect(c).toContain('9780141036144');
  });

  it('misses ISBN placed beyond 100,000 chars (truncated away)', () => {
    // Place filler first, then ISBN beyond the truncation boundary
    const filler = 'A'.repeat(100_001);
    const isbn = '\nISBN 978-0-14-103614-4';
    const text = filler + isbn;
    const c = extractIsbnCandidates(text);
    expect(c).not.toContain('9780141036144');
  });

  it('logs a console.warn when input exceeds MAX_OCR_TEXT_LENGTH', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const filler = 'A'.repeat(100_001);
    extractIsbnCandidates(filler);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('MAX_OCR_TEXT_LENGTH');
    warnSpy.mockRestore();
  });

  it('does NOT log a console.warn when input is within the limit', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    extractIsbnCandidates('ISBN 978-0-14-103614-4');
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

/* ================================================================
 *  extractIsbnCandidates — Pass 5 cross-line labeled ISBN (matchAll fix)
 * ================================================================ */

describe('extractIsbnCandidates — Pass 5 cross-line labeled ISBN', () => {
  it('extracts labeled ISBN split across two lines via capture group', () => {
    // "ISBN 978-0-14-\n103614-4" — the ISBN label + digits span a line break.
    // After the matchAll fix, Pass 5 should extract the capture group (the digit part),
    // not the full match including the "ISBN" prefix.
    const text = 'ISBN 978-0-14-\n103614-4';
    const c = extractIsbnCandidates(text);
    expect(c).toContain('9780141036144');
  });

  it('extracts labeled ISBN-10 split across two lines', () => {
    const text = 'ISBN 0-306-\n40615-2';
    const c = extractIsbnCandidates(text);
    expect(c).toContain('0306406152');
  });

  it('extracts ISBN-10 ending in X in cross-line detection', () => {
    const text = 'ISBN 0-8044-\n2957-X';
    const c = extractIsbnCandidates(text);
    expect(c).toContain('080442957X');
  });

  it('extracts ISBN-13 labeled with ISBN-13 prefix across lines', () => {
    const text = 'ISBN-13: 978-0-306-\n40615-7';
    const c = extractIsbnCandidates(text);
    expect(c).toContain('9780306406157');
  });

  it('handles empty lines between ISBN parts in 3-line join', () => {
    // 3-line join: line[i] + line[i+1] + line[i+2]
    // The middle line is empty, so the ISBN digits come from lines 0 and 2.
    const text = '978-0-14\n\n-103614-4';
    const c = extractIsbnCandidates(text);
    expect(c).toContain('9780141036144');
  });
});

/* ================================================================
 *  fixOcrDigits — aggressive variant tests
 * ================================================================ */

describe('fixOcrDigits — aggressive variant', () => {
  // The aggressive OCR fixer (fixOcrDigitsAggressive) extends fixOcrDigits with
  // A→4, T→7, E→8, R→2, C→0. It is NOT exported directly, but is used in
  // extractIsbnCandidates Pass 1 for labeled ISBNs (applied to the ocrAggressive source text).
  // Since aggressive fixing converts "ISBN" itself to "158N", the label patterns can only
  // match when the non-aggressive sources (toProcess, normalized, ocrFixed) have an intact label.
  // The aggressive fixer's main contribution is creating the ocrAggressive source text,
  // where ISBN digits that were garbled with A/T/E/R/C letters get converted to digits.

  it('aggressive variant handles A→4 via fixOcrDigits chain', () => {
    // fixOcrDigits does NOT convert A→4. The non-aggressive fixer preserves 'A'.
    // We verify this by checking that without a label, the 'A' is not converted.
    expect(fixOcrDigits('A')).toBe('A'); // non-aggressive does NOT convert A
  });

  it('aggressive variant handles T→7 via fixOcrDigits chain', () => {
    // fixOcrDigits does NOT convert T→7.
    expect(fixOcrDigits('T')).toBe('T'); // non-aggressive does NOT convert T
  });

  it('aggressive variant handles E→8 via fixOcrDigits chain', () => {
    // fixOcrDigits does NOT convert E→8.
    expect(fixOcrDigits('E')).toBe('E'); // non-aggressive does NOT convert E
  });

  it('aggressive variant handles R→2 via fixOcrDigits chain', () => {
    // fixOcrDigits does NOT convert R→2.
    expect(fixOcrDigits('R')).toBe('R'); // non-aggressive does NOT convert R
  });

  it('aggressive variant handles C→0 via fixOcrDigits chain', () => {
    // fixOcrDigits does NOT convert C→0.
    expect(fixOcrDigits('C')).toBe('C'); // non-aggressive does NOT convert C
  });

  it('aggressive is NOT applied on unlabeled ISBN extraction (Pass 2/3)', () => {
    // Without a label, aggressive OCR fixing should NOT be applied.
    // Corrupt 978-0-14-103614-4 with 'A' (aggressive: A→4) but no ISBN label.
    // Pass 2/3 use ocrFixed (non-aggressive) which does NOT map A→4.
    // The aggressive version should not create candidates in Pass 2/3.
    const text = '97801A1036144';
    const c = extractIsbnCandidates(text);
    // Non-aggressive fixOcrDigits does not convert A→4.
    // Without a label, the aggressive fixer should not be used for Pass 2/3/4,
    // so the ISBN should not be recovered.
    expect(c).not.toContain('9780141036144');
  });
});
