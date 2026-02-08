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
 * Strategy:
 *   1. Find labeled ISBNs (e.g. "ISBN 978-0-14-103614-4")
 *   2. Find numeric sequences that look like ISBNs (10 or 13 digits)
 *   3. Try OCR digit-fix substitutions for misread characters
 *   4. Deduplicate and rank: valid 978/979 ISBN-13 > other valid ISBN-13 > valid ISBN-10 > invalid
 */
export const extractIsbnCandidates = (text: string): string[] => {
  const candidates: string[] = [];

  // Normalize: remove common OCR artifacts but keep structure
  const normalized = text
    .replace(/\r/g, '\n')       // normalize line endings
    .replace(/[''`]/g, '')       // remove stray quotes (OCR noise)
    .replace(/[^\w\s\-:.X]/g, ' '); // keep alphanumeric, hyphens, colons, X

  // ── Pass 1: Labeled ISBN patterns (highest confidence) ──────
  // Match "ISBN" followed by optional "-10"/"-13"/":"/space then digits
  const isbnLabelPatterns = [
    /ISBN[- ]?(?:1[03])?[: ]?\s*([0-9X][- 0-9X]{9,17})/gi,
    /ISBN[:\s]+([0-9][- 0-9]{8,17}[0-9X])/gi,
  ];

  for (const pattern of isbnLabelPatterns) {
    for (const source of [text, normalized]) {
      const matches = source.matchAll(pattern);
      for (const match of matches) {
        const digits = match[1].replace(/[^0-9X]/g, '');
        if (digits.length === 13 || digits.length === 10) {
          candidates.push(digits);
        }
        // Also try with OCR digit fixes applied to the full match
        const fixed = fixOcrDigits(match[1]).replace(/[^0-9X]/g, '');
        if (fixed.length === 13 || fixed.length === 10) {
          candidates.push(fixed);
        }
      }
    }
  }

  // ── Pass 2: Standalone numeric sequences ────────────────────
  // Look for sequences of digits (possibly separated by hyphens/spaces)
  // that could be ISBNs
  for (const source of [text, normalized, fixOcrDigits(text), fixOcrDigits(normalized)]) {
    // Match sequences starting with a digit, containing digits/hyphens/spaces,
    // ending with a digit or X
    const matches = source.match(/[0-9][- 0-9]{8,17}[0-9X]/g);
    if (matches) {
      for (const m of matches) {
        const clean = m.replace(/[^0-9X]/g, '');
        if (clean.length === 13 || clean.length === 10) {
          candidates.push(clean);
        }
      }
    }
  }

  // ── Pass 3: Try to find 978/979 ISBN-13 in dense text ────────
  // Sometimes OCR produces digits without any separators.
  // Only look for ISBN-13 starting with 978/979 — these are highly
  // specific and won't produce false positives. (ISBN-10 sliding
  // window is too aggressive and creates false positives from garbled text.)
  for (const source of [text, fixOcrDigits(text)]) {
    const digitsOnly = source.replace(/[^0-9]/g, '');
    for (let i = 0; i <= digitsOnly.length - 13; i++) {
      const chunk = digitsOnly.substring(i, i + 13);
      if ((chunk.startsWith('978') || chunk.startsWith('979')) && /^[0-9]{13}$/.test(chunk)) {
        candidates.push(chunk);
      }
    }
  }

  // ── Deduplicate and rank ────────────────────────────────────
  const deduped = Array.from(new Set(candidates));
  const valid = deduped.filter(c => isValidIsbn(c));
  const invalid = deduped.filter(c => !isValidIsbn(c));

  const valid13Pref = valid.filter(c => c.length === 13 && (c.startsWith('978') || c.startsWith('979')));
  const valid13Other = valid.filter(c => c.length === 13 && !valid13Pref.includes(c));
  const valid10 = valid.filter(c => c.length === 10);

  return [...valid13Pref, ...valid13Other, ...valid10, ...invalid];
};
