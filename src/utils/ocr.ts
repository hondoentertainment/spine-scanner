import { isValidIsbn } from './isbnValidation.ts';

/**
 * Fix common OCR digit misreads.
 * These substitutions handle the most frequent character confusions
 * when Tesseract reads ISBN digits.
 */
export const fixOcrDigits = (str: string): string =>
  str.replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8')
    .replace(/[Gg]/g, '9')
    .replace(/[Zz]/g, '2');

/**
 * Extract ISBN candidates from raw OCR text.
 *
 * This function is designed for FULL TEXT output (no character whitelist).
 * Tesseract may return surrounding prose, titles, author names, etc.
 *
 * Strategy:
 *   Pass 1: Find labeled ISBNs ("ISBN 978-0-14-103614-4")
 *   Pass 2: Find 13-digit sequences starting with 978/979
 *   Pass 3: Find any standalone 10 or 13-digit number-like sequences
 *   Pass 4: Sliding window for dense text (978/979 prefix only)
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

  // ── Pass 1: Labeled ISBN patterns (highest confidence) ──────
  const isbnLabelPatterns = [
    /ISBN[- ]?(?:1[03])?[: ]\s*([0-9X][- 0-9X]{8,17})/gi,
    /ISBN[:\s]+([0-9][- 0-9]{8,17}[0-9X])/gi,
    /ISBN[- ]?(?:1[03])?\s*[:=]?\s*([0-9]{3}[- ]?[0-9][- 0-9]{6,12}[0-9X])/gi,
  ];

  for (const pattern of isbnLabelPatterns) {
    for (const source of [text, normalized, ocrFixed]) {
      const matches = source.matchAll(pattern);
      for (const match of matches) {
        const raw = match[1];
        const digits = raw.replace(/[^0-9X]/g, '');
        if (digits.length === 13 || digits.length === 10) {
          candidates.push(digits);
        }
        // Also try OCR-digit-fixed version of the captured group
        const fixed = fixOcrDigits(raw).replace(/[^0-9X]/g, '');
        if ((fixed.length === 13 || fixed.length === 10) && fixed !== digits) {
          candidates.push(fixed);
        }
      }
    }
  }

  // ── Pass 2: Sequences that look like ISBN-13 with 978/979 prefix ──
  // This is high-confidence: 978/979 prefix is very specific to ISBNs.
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
  // Only for ISBN-13 starting with 978/979 — these prefixes are specific
  // enough to avoid false positives. (ISBN-10 sliding window is too
  // aggressive and generates false positives from garbled text.)
  for (const source of [text, normalized, ocrFixed]) {
    const digitsOnly = source.replace(/[^0-9]/g, '');
    for (let i = 0; i <= digitsOnly.length - 13; i++) {
      const chunk = digitsOnly.substring(i, i + 13);
      if ((chunk.startsWith('978') || chunk.startsWith('979')) && /^\d{13}$/.test(chunk)) {
        candidates.push(chunk);
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
