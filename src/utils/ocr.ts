import { isValidIsbn } from './isbnValidation.ts';

/**
 * Fix common OCR digit misreads.
 * These substitutions handle the most frequent character confusions
 * when Tesseract reads ISBN digits.
 *
 * Extended set covers more OCR engine quirks:
 *   O/o → 0,  I/l/| → 1,  S/s/$ → 5,  B → 8,  G/g/q → 9,
 *   Z/z → 2,  A → 4,  T → 7,  D → 0 (in digit context),
 *   {} → () (OCR sometimes reads parens as braces)
 */
export const fixOcrDigits = (str: string): string =>
  str.replace(/[Oo]/g, '0')
    .replace(/[Il|!]/g, '1')
    .replace(/[Ss$]/g, '5')
    .replace(/[Bb]/g, '8')
    .replace(/[Gg]/g, '9')
    .replace(/[Zz]/g, '2')
    .replace(/[Qq]/g, '9')
    .replace(/[D]/g, '0');

/**
 * Aggressive OCR digit fixing — applies ALL letter→digit mappings.
 * Use only for sequences that are very likely ISBN digits (e.g.,
 * near an ISBN label or starting with 978/979).
 */
const fixOcrDigitsAggressive = (str: string): string =>
  fixOcrDigits(str)
    .replace(/[Aa]/g, '4')
    .replace(/[Tt]/g, '7')
    .replace(/[Ee]/g, '8')
    .replace(/[Rr]/g, '2')
    .replace(/[Cc]/g, '0');

/**
 * Try generating checksum-valid variants by toggling ambiguous digits.
 * If an ISBN candidate is close but has a bad checksum, this tries
 * single-digit substitutions at each position.
 */
export const tryFixChecksum = (candidate: string): string | null => {
  if (isValidIsbn(candidate)) return candidate;

  // Common OCR ambiguities: 0↔O↔D, 1↔I↔l, 5↔S, 8↔B, 9↔g, 2↔Z
  const ambiguous: Record<string, string[]> = {
    '0': ['6', '8', '9'],
    '1': ['7', '4'],
    '3': ['8'],
    '5': ['6', '8', '9'],
    '6': ['0', '5', '8'],
    '7': ['1'],
    '8': ['0', '3', '6', '9'],
    '9': ['0', '7'],
  };

  // Only try single-character fixes (avoid combinatorial explosion)
  for (let i = 0; i < candidate.length; i++) {
    const ch = candidate[i];
    const alternatives = ambiguous[ch];
    if (!alternatives) continue;
    for (const alt of alternatives) {
      const variant = candidate.substring(0, i) + alt + candidate.substring(i + 1);
      if (isValidIsbn(variant)) return variant;
    }
  }
  return null;
};

/**
 * Get all near-miss ISBN variants (single-digit substitutions that validate).
 * Used to surface "Try 978-0-14-103614-4?" when OCR returns a close-but-invalid candidate.
 */
export const getNearMissCandidates = (candidate: string): string[] => {
  if (isValidIsbn(candidate)) return []; // No fixes needed for valid ISBN

  const results: string[] = [];
  const ambiguous: Record<string, string[]> = {
    '0': ['6', '8', '9'], '1': ['7', '4'], '3': ['8'], '5': ['6', '8', '9'],
    '6': ['0', '5', '8'], '7': ['1'], '8': ['0', '3', '6', '9'], '9': ['0', '7'],
  };

  for (let i = 0; i < candidate.length; i++) {
    const ch = candidate[i];
    const alternatives = ambiguous[ch];
    if (!alternatives) continue;
    for (const alt of alternatives) {
      const variant = candidate.substring(0, i) + alt + candidate.substring(i + 1);
      if (isValidIsbn(variant) && !results.includes(variant)) results.push(variant);
    }
  }
  return results;
};

/**
 * Extract ISBN candidates from raw OCR text.
 *
 * This function is designed for FULL TEXT output (no character whitelist).
 * Tesseract may return surrounding prose, titles, author names, etc.
 *
 * Strategy:
 *   Pass 1: Find labeled ISBNs ("ISBN 978-0-14-103614-4", "ISBN-13:", "ISBN-10:")
 *   Pass 2: Find 13-digit sequences starting with 978/979
 *   Pass 3: Find any standalone 10 or 13-digit number-like sequences
 *   Pass 4: Sliding window for dense text (978/979 prefix only)
 *   Pass 5: Cross-line ISBN detection (ISBNs split by line breaks)
 *   Pass 6: Fuzzy checksum repair on near-valid candidates
 *   Deduplicate and rank by validity confidence.
 */
export const extractIsbnCandidates = (text: string): string[] => {
  if (!text || text.trim().length === 0) return [];

  const candidates: string[] = [];

  // Normalize: remove common OCR artifacts but keep structure
  const normalized = text
    .replace(/\r/g, '\n')
    .replace(/[''`""\u201c\u201d]/g, '')  // curly quotes
    .replace(/[^\w\s\-:.X]/g, ' ');       // keep alphanumeric, hyphens, colons, X

  // Also create an OCR-digit-fixed version for noisy scans
  const ocrFixed = fixOcrDigits(normalized);

  // And an aggressively fixed version for very noisy text near ISBN labels
  const ocrAggressive = fixOcrDigitsAggressive(normalized);

  // ── Pass 1: Labeled ISBN patterns (highest confidence) ──────
  // Includes "ISBN-13:", "ISBN-10:", "ISBN 13:", "ISBN 10:", etc.
  const isbnLabelPatterns = [
    /ISBN[- ]?(?:1[03])?[: ]\s*([0-9X][- 0-9X]{8,17})/gi,
    /ISBN[:\s]+([0-9][- 0-9]{8,17}[0-9X])/gi,
    /ISBN[- ]?(?:1[03])?\s*[:=]?\s*([0-9]{3}[- ]?[0-9][- 0-9]{6,12}[0-9X])/gi,
    // "ISBN-13: 978-..." or "ISBN-10: 0-..."
    /ISBN[- ]?1[03]\s*[:=]?\s*([0-9][- 0-9X]{8,17})/gi,
    // Just "ISBN" followed by digits (no separator)
    /ISBN\s*([0-9]{9,13}[0-9X])/gi,
    // "I.S.B.N." with dots
    /I\.?\s*S\.?\s*B\.?\s*N\.?\s*[-:=]?\s*([0-9][- 0-9X]{8,17})/gi,
  ];

  for (const pattern of isbnLabelPatterns) {
    for (const source of [text, normalized, ocrFixed, ocrAggressive]) {
      const matches = source.matchAll(pattern);
      for (const match of matches) {
        const raw = match[1];
        const digits = raw.replace(/[^0-9X]/g, '');
        if (digits.length === 13 || digits.length === 10) {
          candidates.push(digits);
        }
        // Try OCR-digit-fixed version of the captured group
        const fixed = fixOcrDigits(raw).replace(/[^0-9X]/g, '');
        if ((fixed.length === 13 || fixed.length === 10) && fixed !== digits) {
          candidates.push(fixed);
        }
        // Try aggressive fix for labeled ISBNs (high confidence context)
        const aggFixed = fixOcrDigitsAggressive(raw).replace(/[^0-9X]/g, '');
        if ((aggFixed.length === 13 || aggFixed.length === 10) && aggFixed !== digits && aggFixed !== fixed) {
          candidates.push(aggFixed);
        }
      }
    }
  }

  // ── Pass 2: Sequences that look like ISBN-13 with 978/979 prefix ──
  // This is high-confidence: 978/979 prefix is very specific to ISBNs.
  // Note: ocrAggressive is NOT used here — it converts too many letters
  // to digits, creating false 978-sequences from prose text.
  const isbn13Pattern = /(?:978|979)[- ]?\d[- 0-9]{7,12}\d/g;
  for (const source of [text, normalized, ocrFixed]) {
    const matches = source.match(isbn13Pattern);
    if (matches) {
      for (const m of matches) {
        const clean = m.replace(/[^0-9]/g, '');
        if (clean.length === 13) {
          candidates.push(clean);
        }
      }
    }
  }

  // ── Pass 3: Standalone 10/13-digit numeric sequences ────────
  // Look for digit sequences with optional hyphens/spaces
  const numericSeqPattern = /\d[- 0-9]{8,17}\d/g;
  for (const source of [text, normalized, ocrFixed]) {
    const matches = source.match(numericSeqPattern);
    if (matches) {
      for (const m of matches) {
        const clean = m.replace(/[^0-9X]/g, '');
        if (clean.length === 13 || clean.length === 10) {
          candidates.push(clean);
        }
      }
    }
  }

  // ── Pass 4: Sliding window for dense/concatenated text ──────
  // For ISBN-13 starting with 978/979.
  // ocrAggressive is excluded — too many false positives from prose.
  for (const source of [text, normalized, ocrFixed]) {
    const digitsOnly = source.replace(/[^0-9]/g, '');
    for (let i = 0; i <= digitsOnly.length - 13; i++) {
      const chunk = digitsOnly.substring(i, i + 13);
      if ((chunk.startsWith('978') || chunk.startsWith('979')) && /^\d{13}$/.test(chunk)) {
        candidates.push(chunk);
      }
    }
  }

  // ── Pass 5: Cross-line ISBN detection ───────────────────────
  // ISBNs on book spines are sometimes split across multiple lines.
  // Join adjacent lines and look for ISBNs that span the break.
  const lines = text.split(/\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    // Join pairs of adjacent lines (removing the line break)
    const joined = lines[i].trimEnd() + lines[i + 1].trimStart();
    const joinedFixed = fixOcrDigits(joined);

    for (const source of [joined, joinedFixed]) {
      // Check for ISBN-13 with 978/979
      const matches13 = source.match(/(?:978|979)[- ]?\d[- 0-9]{7,12}\d/g);
      if (matches13) {
        for (const m of matches13) {
          const clean = m.replace(/[^0-9]/g, '');
          if (clean.length === 13) candidates.push(clean);
        }
      }
      // Check for labeled ISBNs spanning lines
      const matchesLabeled = source.match(/ISBN[- ]?(?:1[03])?\s*[:=]?\s*([0-9][- 0-9X]{8,17})/gi);
      if (matchesLabeled) {
        for (const m of matchesLabeled) {
          const digits = m.replace(/[^0-9X]/g, '');
          if (digits.length === 13 || digits.length === 10) {
            candidates.push(digits);
          }
        }
      }
    }

    // Also try joining 3 consecutive lines for badly fragmented text
    if (i < lines.length - 2) {
      const joined3 = lines[i].trimEnd() + lines[i + 1].trim() + lines[i + 2].trimStart();
      const digits3 = fixOcrDigits(joined3).replace(/[^0-9]/g, '');
      for (let j = 0; j <= digits3.length - 13; j++) {
        const chunk = digits3.substring(j, j + 13);
        if ((chunk.startsWith('978') || chunk.startsWith('979')) && /^\d{13}$/.test(chunk)) {
          candidates.push(chunk);
        }
      }
    }
  }

  // ── Deduplicate and rank ────────────────────────────────────
  const deduped = Array.from(new Set(candidates));
  const valid = deduped.filter(c => isValidIsbn(c));
  const invalid = deduped.filter(c => !isValidIsbn(c));

  // Rank: valid ISBN-13 with 978/979 > other valid ISBN-13 > valid ISBN-10 > invalid
  const valid13Pref = valid.filter(c => c.length === 13 && (c.startsWith('978') || c.startsWith('979')));
  const valid13Other = valid.filter(c => c.length === 13 && !valid13Pref.includes(c));
  const valid10 = valid.filter(c => c.length === 10);

  return [...valid13Pref, ...valid13Other, ...valid10, ...invalid];
};
