import { isValidIsbn } from './isbnValidation.ts';

/**
 * Fix common OCR digit misreads (OCR best-practice normalization).
 * Core set per spec: O→0, I→1, S→5, B→8, G→9, Z→2.
 * Extended set covers more OCR engine quirks:
 *   O/o → 0,  I/l/|/! → 1,  S/s/$ → 5,  B/b → 8,  G/g/q → 9,
 *   Z/z → 2,  D/d → 0 (in digit context).
 * Apply before validation; checksum repair uses OCR_AMBIGUITY_MAP for single-digit substitutions.
 */
export const fixOcrDigits = (str: string): string =>
  str.replace(/[Oo]/g, '0')
    .replace(/[Il|!]/g, '1')
    .replace(/[Ss$]/g, '5')
    .replace(/[Bb]/g, '8')
    .replace(/[Gg]/g, '9')
    .replace(/[Zz]/g, '2')
    .replace(/[Qq]/g, '9')
    .replace(/[Dd]/g, '0');

/**
 * Aggressive OCR digit fixing — applies ALL letter→digit mappings.
 * Use only for sequences that are very likely ISBN digits (e.g.,
 * near an ISBN label or starting with 978/979).
 * Extended mappings per OCR best practices: Y→4, U→0, F→7, P→9 for spine misreads.
 */
const fixOcrDigitsAggressive = (str: string): string =>
  fixOcrDigits(str)
    .replace(/[Aa]/g, '4')
    .replace(/[Tt]/g, '7')
    .replace(/[Ee]/g, '8')
    .replace(/[Rr]/g, '2')
    .replace(/[Cc]/g, '0')
    .replace(/[Yy]/g, '4')
    .replace(/[Uu]/g, '0')
    .replace(/[Ff]/g, '7')
    .replace(/[Pp]/g, '9');

/**
 * Common OCR ambiguity map: digit/letter → alternatives to try when checksum fails.
 * Shared by tryFixChecksum() and getNearMissCandidates() to ensure consistent repair.
 *
 * Digit confusions: 0↔6↔8↔9, 1↔7↔4, 2↔7↔3, 3↔8↔5, 5↔3↔6↔8↔9, 7↔1↔2, 9↔4
 * Letter→digit (OCR best-practice): O→0, I→1, S→5, B→8, G→9, Z→2
 * X→0 (ISBN-10 check digit: X=10 can be misread as digit)
 */
export const OCR_AMBIGUITY_MAP: Record<string, string[]> = {
  '0': ['6', '8', '9'],
  '1': ['7', '4'],
  '2': ['7', '3'],
  '3': ['8', '5'],
  '4': ['1', '9'],
  '5': ['6', '8', '9', '3'],
  '6': ['0', '5', '8'],
  '7': ['1', '2'],
  '8': ['0', '3', '6', '9'],
  '9': ['0', '7', '4'],
  'X': ['0'],
  /* Letter alternatives for near-valid candidates that slipped through with letters */
  'O': ['0'], 'o': ['0'], 'I': ['1'], 'l': ['1'], 'S': ['5'], 's': ['5'],
  'B': ['8'], 'b': ['8'], 'G': ['9'], 'g': ['9'], 'Z': ['2'], 'z': ['2'],
  'D': ['0'], 'd': ['0'], 'Q': ['9'], 'q': ['9'],
  'A': ['4'], 'a': ['4'], 'T': ['7'], 't': ['7'], 'E': ['8'], 'e': ['8'],
  'R': ['2'], 'r': ['2'], 'C': ['0'], 'c': ['0'], 'Y': ['4'], 'y': ['4'],
  'U': ['0'], 'u': ['0'], 'F': ['7'], 'f': ['7'], 'P': ['9'], 'p': ['9'],
};

/**
 * Try generating checksum-valid variants by toggling ambiguous digits.
 * If an ISBN candidate is close but has a bad checksum, this tries
 * single-digit substitutions at each position.
 */
export const tryFixChecksum = (candidate: string): string | null => {
  if (isValidIsbn(candidate)) return candidate;
  if (candidate.length !== 10 && candidate.length !== 13) return null;

  // Only try single-character fixes (avoid combinatorial explosion)
  for (let i = 0; i < candidate.length; i++) {
    const ch = candidate[i];
    const alternatives = OCR_AMBIGUITY_MAP[ch];
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
  if (candidate.length !== 10 && candidate.length !== 13) return [];

  const results: string[] = [];

  for (let i = 0; i < candidate.length; i++) {
    const ch = candidate[i];
    const alternatives = OCR_AMBIGUITY_MAP[ch];
    if (!alternatives) continue;
    for (const alt of alternatives) {
      const variant = candidate.substring(0, i) + alt + candidate.substring(i + 1);
      if (isValidIsbn(variant) && !results.includes(variant)) results.push(variant);
    }
  }
  return results;
};

/**
 * Try TWO-position substitutions to fix an invalid ISBN checksum.
 * Catches ISBNs with 2 OCR errors that tryFixChecksum (single-sub) misses.
 * When charConfidences is provided, only the 6 least-confident positions
 * are tried to keep the search space manageable.
 */
export const tryFixChecksumDouble = (
  candidate: string,
  charConfidences?: number[],
): string | null => {
  if (isValidIsbn(candidate)) return candidate;
  if (candidate.length !== 10 && candidate.length !== 13) return null;

  const MAX_ITERATIONS = 5000;
  let iterations = 0;

  let positions: number[];

  if (charConfidences && charConfidences.length === candidate.length) {
    const indexed = charConfidences.map((conf, idx) => ({ idx, conf }));
    indexed.sort((a, b) => a.conf - b.conf);
    positions = indexed.slice(0, 6).map(e => e.idx).sort((a, b) => a - b);
  } else {
    positions = [];
    for (let i = 0; i < candidate.length; i++) {
      if (OCR_AMBIGUITY_MAP[candidate[i]]) positions.push(i);
    }
  }

  for (let pi = 0; pi < positions.length; pi++) {
    const i = positions[pi];
    const altsI = OCR_AMBIGUITY_MAP[candidate[i]];
    if (!altsI) continue;

    for (let pj = pi + 1; pj < positions.length; pj++) {
      const j = positions[pj];
      const altsJ = OCR_AMBIGUITY_MAP[candidate[j]];
      if (!altsJ) continue;

      for (const altI of altsI) {
        for (const altJ of altsJ) {
          if (++iterations > MAX_ITERATIONS) return null;
          const variant =
            candidate.substring(0, i) + altI +
            candidate.substring(i + 1, j) + altJ +
            candidate.substring(j + 1);
          if (isValidIsbn(variant)) return variant;
        }
      }
    }
  }

  return null;
};

/**
 * Try THREE-position substitutions to fix an invalid ISBN checksum.
 * Catches ISBNs with 3 OCR errors that single/double-sub miss.
 * Uses confidence-guided position selection when available; otherwise
 * limited to first 8 ambiguous positions. Capped iterations to avoid explosion.
 */
export const tryFixChecksumTriple = (
  candidate: string,
  charConfidences?: number[],
): string | null => {
  if (isValidIsbn(candidate)) return candidate;
  if (candidate.length !== 10 && candidate.length !== 13) return null;

  const MAX_ITERATIONS = 2000;
  let iterations = 0;

  let positions: number[];
  if (charConfidences && charConfidences.length === candidate.length) {
    const indexed = charConfidences.map((conf, idx) => ({ idx, conf }));
    indexed.sort((a, b) => a.conf - b.conf);
    positions = indexed.slice(0, 8).map(e => e.idx).sort((a, b) => a - b);
  } else {
    positions = [];
    for (let i = 0; i < candidate.length; i++) {
      if (OCR_AMBIGUITY_MAP[candidate[i]]) positions.push(i);
    }
    positions = positions.slice(0, 8);
  }

  for (let pi = 0; pi < positions.length; pi++) {
    const i = positions[pi];
    const altsI = OCR_AMBIGUITY_MAP[candidate[i]];
    if (!altsI) continue;
    for (let pj = pi + 1; pj < positions.length; pj++) {
      const j = positions[pj];
      const altsJ = OCR_AMBIGUITY_MAP[candidate[j]];
      if (!altsJ) continue;
      for (let pk = pj + 1; pk < positions.length; pk++) {
        const k = positions[pk];
        const altsK = OCR_AMBIGUITY_MAP[candidate[k]];
        if (!altsK) continue;
        for (const altI of altsI) {
          for (const altJ of altsJ) {
            for (const altK of altsK) {
              if (++iterations > MAX_ITERATIONS) return null;
              const variant =
                candidate.substring(0, i) + altI +
                candidate.substring(i + 1, j) + altJ +
                candidate.substring(j + 1, k) + altK +
                candidate.substring(k + 1);
              if (isValidIsbn(variant)) return variant;
            }
          }
        }
      }
    }
  }
  return null;
};

/**
 * Extract per-character confidence values from Tesseract symbol data.
 * Filters to ISBN-relevant characters (digits and 'X') and returns
 * confidence values (0–100) for each.
 */
export const getCharConfidenceWeights = (
  symbols: Array<{ text: string; confidence: number }>,
): number[] => {
  if (!symbols || symbols.length === 0) return [];
  return symbols
    .filter(s => /^[0-9X]$/i.test(s.text))
    .map(s => s.confidence);
};

/**
 * Extract ISBN candidates from raw OCR text.
 *
 * This function is designed for FULL TEXT output (no character whitelist).
 * Tesseract may return surrounding prose, titles, author names, etc.
 *
 * Strategy (multi-pass extraction with deduplication):
 *   Pass 1: Find labeled ISBNs ("ISBN 978-0-14-103614-4", "ISBN-13:", "ISBN-10:")
 *   Pass 2: Find 13-digit sequences starting with 978/979
 *   Pass 3: Find any standalone 10 or 13-digit number-like sequences
 *   Pass 4: Sliding window for dense text (978/979 prefix only)
 *   Pass 5: Cross-line ISBN detection (ISBNs split by line breaks)
 *   Deduplicate via Set; validate via isValidIsbn for ranking.
 *   Checksum repair for near-valid candidates is applied in useOcrEngine.runOcr and useScanPipeline.
 */
/** Max OCR text length to process (avoids slowdown/DoS from huge input). ~100KB is plenty for book text. */
const MAX_OCR_TEXT_LENGTH = 100_000;

/** Normalize ISBN-10 check digit: lowercase x → X per ISO 2108. */
const normIsbn10 = (s: string): string =>
  s.length === 10 ? s.replace(/x$/i, 'X') : s;

export const extractIsbnCandidates = (text: string): string[] => {
  if (!text || text.trim().length === 0) return [];
  let toProcess = text.trim();
  if (toProcess.length > MAX_OCR_TEXT_LENGTH) {
    // Process prefix to avoid slowdown/DoS; ISBNs are usually in the first portion of OCR output
    console.warn(
      `[OCR] Input text (${toProcess.length} chars) exceeds MAX_OCR_TEXT_LENGTH (${MAX_OCR_TEXT_LENGTH}). ` +
      `Truncating to first ${MAX_OCR_TEXT_LENGTH} chars — ISBNs beyond this point will be missed.`
    );
    toProcess = toProcess.substring(0, MAX_OCR_TEXT_LENGTH);
  }

  const candidates: string[] = [];

  // Normalize: remove common OCR artifacts but keep structure
  const normalized = toProcess
    .replace(/\r/g, '\n')
    .replace(/[''`""\u201c\u201d]/g, '')  // curly quotes
    .replace(/[^\w\s\-:.X]/g, ' ')        // keep alphanumeric, hyphens, colons, X
    .replace(/[ \t]+/g, ' ');             // collapse horizontal whitespace (OCR noise)

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
    // Permissive: allow common OCR letter confusions (Y,U,F,P,A,T,E,R,C etc) in digit part
    /ISBN[- ]?(?:1[03])?[: ]\s*([0-9A-Za-z][- 0-9A-Za-z]{8,17})/gi,
  ];

  /** Extract digits/X from string and normalize ISBN-10 x→X per ISO 2108. */
  const toDigits = (s: string): string =>
    normIsbn10(s.replace(/[^0-9Xx]/g, ''));

  for (const pattern of isbnLabelPatterns) {
    for (const source of [toProcess, normalized, ocrFixed, ocrAggressive]) {
      const matches = source.matchAll(pattern);
      for (const match of matches) {
        const raw = match[1];
        const digits = normIsbn10(raw.replace(/[^0-9Xx]/g, ''));
        if (digits.length === 13 || digits.length === 10) {
          candidates.push(digits);
        }
        // Try OCR-digit-fixed version of the captured group
        const fixed = normIsbn10(fixOcrDigits(raw).replace(/[^0-9Xx]/g, ''));
        if ((fixed.length === 13 || fixed.length === 10) && fixed !== digits) {
          candidates.push(fixed);
        }
        // Try aggressive fix for labeled ISBNs (high confidence context)
        const aggFixed = normIsbn10(fixOcrDigitsAggressive(raw).replace(/[^0-9Xx]/g, ''));
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
  for (const source of [toProcess, normalized, ocrFixed]) {
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
  const numericSeqPattern = /\d[- 0-9Xx]{8,17}[\dXx]/g;
  for (const source of [toProcess, normalized, ocrFixed]) {
    const matches = source.match(numericSeqPattern);
    if (matches) {
      for (const m of matches) {
        const clean = toDigits(m);
        if (clean.length === 13 || clean.length === 10) {
          candidates.push(clean);
        }
      }
    }
  }

  // ── Pass 4: Sliding window for dense/concatenated text ──────
  // For ISBN-13 starting with 978/979.
  // ocrAggressive is excluded — too many false positives from prose.
  for (const source of [toProcess, normalized, ocrFixed]) {
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
  const lines = toProcess.split(/\n/);
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
      const matchesLabeled = source.matchAll(/ISBN[- ]?(?:1[03])?\s*[:=]?\s*([0-9][- 0-9Xx]{8,17})/gi);
      for (const match of matchesLabeled) {
        const raw = match[1];
        const digits = toDigits(raw);
        if (digits.length === 13 || digits.length === 10) {
          candidates.push(digits);
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

    // Pass 6: Four-line span for extremely fragmented ISBNs on worn spines
    if (i < lines.length - 3) {
      const joined4 = lines[i].trimEnd() + lines[i + 1].trim() + lines[i + 2].trim() + lines[i + 3].trimStart();
      const digits4 = fixOcrDigits(joined4).replace(/[^0-9]/g, '');
      for (let j = 0; j <= digits4.length - 13; j++) {
        const chunk = digits4.substring(j, j + 13);
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
