#!/usr/bin/env node
/**
 * Phase 25 — Device Benchmark Runner
 *
 * Runs the ISBN extraction / OCR pipeline steps against a set of fixture
 * images (real or synthetic) and outputs timing + accuracy results as CSV.
 *
 * Usage:
 *   node scripts/benchmark-scan.mjs
 *   node scripts/benchmark-scan.mjs --out results.csv
 *
 * Output: CSV to stdout (or file if --out specified) with columns:
 *   fixture, method, success, duration_ms, extracted_isbn
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';
import { performance } from 'perf_hooks';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Dynamic imports of project source (ESM / TS via inline transpile) ────────
// We import the compiled functions by evaluating the TS source manually.
// Since the project uses "type": "module" and the utils are pure functions
// with no DOM dependencies, we can extract them for Node usage.

// ── Inline ISBN validation (mirrors src/utils/isbnValidation.ts) ─────────────

function isValidIsbn10(isbn) {
  if (isbn.length !== 10) return false;
  if (!/^[0-9]{9}[0-9Xx]$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * parseInt(isbn[i], 10);
  const last = isbn[9].toUpperCase();
  sum += last === 'X' ? 10 : parseInt(last, 10);
  return sum % 11 === 0;
}

function isValidIsbn13(isbn) {
  if (isbn.length !== 13) return false;
  if (!/^[0-9]{13}$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += (i % 2 === 0 ? 1 : 3) * parseInt(isbn[i], 10);
  return sum % 10 === 0;
}

function isValidIsbn(isbn) {
  if (isbn.length === 10) return isValidIsbn10(isbn);
  if (isbn.length === 13) return isValidIsbn13(isbn);
  return false;
}

// ── Inline OCR digit fixing (mirrors src/utils/ocr.ts) ──────────────────────

function fixOcrDigits(str) {
  return str
    .replace(/[Oo]/g, '0')
    .replace(/[Il|!]/g, '1')
    .replace(/[Ss$]/g, '5')
    .replace(/[Bb]/g, '8')
    .replace(/[Gg]/g, '9')
    .replace(/[Zz]/g, '2')
    .replace(/[Qq]/g, '9')
    .replace(/[Dd]/g, '0');
}

const OCR_AMBIGUITY_MAP = {
  '0': ['6', '8', '9'], '1': ['7', '4'], '2': ['7', '3'],
  '3': ['8', '5'], '4': ['1', '9'], '5': ['6', '8', '9', '3'],
  '6': ['0', '5', '8'], '7': ['1', '2'], '8': ['0', '3', '6', '9'],
  '9': ['0', '7', '4'], 'X': ['0'],
};

function tryFixChecksum(candidate) {
  if (isValidIsbn(candidate)) return candidate;
  if (candidate.length !== 10 && candidate.length !== 13) return null;
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
}

// ── Inline extractIsbnCandidates (simplified for benchmark) ─────────────────

function normIsbn10(s) {
  return s.length === 10 ? s.replace(/x$/i, 'X') : s;
}

function extractIsbnCandidates(text) {
  if (!text || text.trim().length === 0) return [];
  const toProcess = text.trim();
  const candidates = [];

  const normalized = toProcess
    .replace(/\r/g, '\n')
    .replace(/[''`""\u201c\u201d]/g, '')
    .replace(/[^\w\s\-:.X]/g, ' ')
    .replace(/[ \t]+/g, ' ');

  const ocrFixed = fixOcrDigits(normalized);

  const toDigits = (s) => normIsbn10(s.replace(/[^0-9Xx]/g, ''));

  // Pass 1: Labeled ISBNs
  const isbnLabelPatterns = [
    /ISBN[- ]?(?:1[03])?[: ]\s*([0-9X][- 0-9X]{8,17})/gi,
    /ISBN[:\s]+([0-9][- 0-9]{8,17}[0-9X])/gi,
    /ISBN\s*([0-9]{9,13}[0-9X])/gi,
  ];
  for (const pattern of isbnLabelPatterns) {
    for (const source of [toProcess, normalized, ocrFixed]) {
      for (const match of source.matchAll(pattern)) {
        const digits = normIsbn10(match[1].replace(/[^0-9Xx]/g, ''));
        if (digits.length === 13 || digits.length === 10) candidates.push(digits);
      }
    }
  }

  // Pass 2: 978/979 sequences
  const isbn13Pattern = /(?:978|979)[- ]?\d[- 0-9]{7,12}\d/g;
  for (const source of [toProcess, normalized, ocrFixed]) {
    const matches = source.match(isbn13Pattern);
    if (matches) {
      for (const m of matches) {
        const clean = m.replace(/[^0-9]/g, '');
        if (clean.length === 13) candidates.push(clean);
      }
    }
  }

  // Pass 3: Standalone 10/13-digit sequences
  const numericSeqPattern = /\d[- 0-9Xx]{8,17}[\dXx]/g;
  for (const source of [toProcess, normalized, ocrFixed]) {
    const matches = source.match(numericSeqPattern);
    if (matches) {
      for (const m of matches) {
        const clean = toDigits(m);
        if (clean.length === 13 || clean.length === 10) candidates.push(clean);
      }
    }
  }

  // Pass 4: Sliding window
  for (const source of [toProcess, normalized, ocrFixed]) {
    const digitsOnly = source.replace(/[^0-9]/g, '');
    for (let i = 0; i <= digitsOnly.length - 13; i++) {
      const chunk = digitsOnly.substring(i, i + 13);
      if ((chunk.startsWith('978') || chunk.startsWith('979')) && /^\d{13}$/.test(chunk)) {
        candidates.push(chunk);
      }
    }
  }

  const deduped = Array.from(new Set(candidates));
  const valid = deduped.filter(c => isValidIsbn(c));
  const invalid = deduped.filter(c => !isValidIsbn(c));
  return [...valid, ...invalid];
}

// ── Image processing functions (mirrors src/utils/imageProcessing.ts) ────────

function applyOtsuBinarization(imageData) {
  const data = imageData.data;
  const totalPixels = imageData.width * imageData.height;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) histogram[data[i]]++;

  let sumTotal = 0;
  for (let t = 0; t < 256; t++) sumTotal += t * histogram[t];

  let sumBg = 0, weightBg = 0, maxVariance = 0, bestThreshold = 0;
  for (let t = 0; t < 256; t++) {
    weightBg += histogram[t];
    if (weightBg === 0) continue;
    const weightFg = totalPixels - weightBg;
    if (weightFg === 0) break;
    sumBg += t * histogram[t];
    const meanBg = sumBg / weightBg;
    const meanFg = (sumTotal - sumBg) / weightFg;
    const diff = meanBg - meanFg;
    const variance = weightBg * weightFg * diff * diff;
    if (variance > maxVariance) { maxVariance = variance; bestThreshold = t; }
  }

  for (let i = 0; i < data.length; i += 4) {
    const v = data[i] < bestThreshold ? 0 : 255;
    data[i] = data[i + 1] = data[i + 2] = v;
  }
}

function measureContrast(imageData) {
  const data = imageData.data;
  const n = imageData.width * imageData.height;
  if (n === 0) return 0;
  let sum = 0, sumSq = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += data[i];
    sumSq += data[i] * data[i];
  }
  const mean = sum / n;
  return Math.sqrt(Math.max(sumSq / n - mean * mean, 0));
}

// ── Fixture definitions ──────────────────────────────────────────────────────

const DIGIT_FONT = JSON.parse(readFileSync(join(ROOT, 'src', 'utils', 'digitFont.json'), 'utf-8'));
const FIXTURE_DIR = join(ROOT, 'e2e', 'fixtures');

/**
 * Generate a synthetic PNG buffer with ISBN text rendered using the bitmap font.
 * Returns { pngBuffer, expectedIsbn, name }.
 */
function generateSyntheticFixture(isbn, name, opts = {}) {
  const { scale = 24, pad = 24, noise = 0, brightness = 255, invert = false } = opts;
  const GLYPH_W = 5;
  const GLYPH_H = 7;
  const width = pad * 2 + isbn.length * (GLYPH_W * scale + scale) - scale;
  const height = pad * 2 + GLYPH_H * scale;

  const png = new PNG({ width, height, filterType: -1 });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = x - pad;
      const gy = y - pad;
      let v = brightness; // background
      if (gx >= 0 && gy >= 0 && gx < width - pad * 2 && gy < GLYPH_H * scale) {
        const charIndex = Math.floor(gx / (GLYPH_W * scale + scale));
        const withinChar = gx % (GLYPH_W * scale + scale);
        if (withinChar < GLYPH_W * scale && charIndex < isbn.length) {
          const digit = isbn[charIndex];
          const col = Math.floor(withinChar / scale);
          const row = Math.floor(gy / scale);
          const pattern = DIGIT_FONT[digit]?.[row];
          if (pattern && pattern[col] === '1') {
            v = invert ? brightness : 0;
          } else {
            v = invert ? 0 : brightness;
          }
        }
      }

      // Add noise
      if (noise > 0) {
        v = Math.max(0, Math.min(255, v + Math.floor((Math.random() - 0.5) * noise * 2)));
      }

      const idx = (width * y + x) << 2;
      png.data[idx] = v;
      png.data[idx + 1] = v;
      png.data[idx + 2] = v;
      png.data[idx + 3] = 255;
    }
  }

  return {
    png,
    width,
    height,
    expectedIsbn: isbn,
    name,
  };
}

/** Read a real PNG fixture and return image data. */
function readPngFixture(filePath) {
  const buffer = readFileSync(filePath);
  const png = PNG.sync.read(buffer);
  return {
    data: new Uint8ClampedArray(png.data),
    width: png.width,
    height: png.height,
  };
}

/** Convert PNG to ImageData-like object. */
function pngToImageData(png) {
  return {
    data: new Uint8ClampedArray(png.data),
    width: png.width,
    height: png.height,
  };
}

// ── Benchmark methods ────────────────────────────────────────────────────────

/**
 * Simulate OCR text extraction from the synthetic image.
 * Since we cannot run real Tesseract in Node without WASM setup,
 * we "read" the bitmap font back from the pixel data.
 */
function bitmapOcr(imageData, scale = 24, pad = 24) {
  const GLYPH_W = 5;
  const GLYPH_H = 7;
  const { data, width } = imageData;
  const charCount = Math.floor((width - pad * 2 + scale) / (GLYPH_W * scale + scale));
  let text = '';

  for (let ci = 0; ci < charCount; ci++) {
    let bestDigit = '?';
    let bestScore = -1;

    for (const [digit, patterns] of Object.entries(DIGIT_FONT)) {
      let score = 0;
      let total = 0;
      for (let row = 0; row < GLYPH_H; row++) {
        for (let col = 0; col < GLYPH_W; col++) {
          const x = pad + ci * (GLYPH_W * scale + scale) + col * scale + Math.floor(scale / 2);
          const y = pad + row * scale + Math.floor(scale / 2);
          if (x >= width || y >= imageData.height) continue;
          const idx = (y * width + x) * 4;
          const pixel = data[idx];
          const expected = patterns[row]?.[col] === '1' ? 0 : 255;
          if ((pixel < 128) === (expected < 128)) score++;
          total++;
        }
      }
      const pct = total > 0 ? score / total : 0;
      if (pct > bestScore) { bestScore = pct; bestDigit = digit; }
    }
    text += bestDigit;
  }

  return text;
}

/**
 * Method: direct bitmap OCR + ISBN extraction
 */
function benchmarkBitmapOcr(imageData, scale, pad) {
  const raw = bitmapOcr(imageData, scale, pad);
  const candidates = extractIsbnCandidates(raw);
  return { rawText: raw, candidates, isbn: candidates[0] || null };
}

/**
 * Method: Otsu binarization + bitmap OCR + ISBN extraction
 */
function benchmarkOtsuThenOcr(imageData, scale, pad) {
  const copy = {
    data: new Uint8ClampedArray(imageData.data),
    width: imageData.width,
    height: imageData.height,
  };
  applyOtsuBinarization(copy);
  const raw = bitmapOcr(copy, scale, pad);
  const candidates = extractIsbnCandidates(raw);
  return { rawText: raw, candidates, isbn: candidates[0] || null };
}

/**
 * Method: extractIsbnCandidates from known text (tests the extraction pipeline)
 */
function benchmarkTextExtraction(text) {
  const candidates = extractIsbnCandidates(text);
  return { rawText: text, candidates, isbn: candidates[0] || null };
}

/**
 * Method: tryFixChecksum on a near-miss candidate
 */
function benchmarkChecksumRepair(badIsbn) {
  const repaired = tryFixChecksum(badIsbn);
  return { rawText: badIsbn, candidates: repaired ? [repaired] : [], isbn: repaired };
}

/**
 * Method: measureContrast (image quality assessment)
 */
function benchmarkContrastMeasure(imageData) {
  const contrast = measureContrast(imageData);
  return { rawText: `contrast=${contrast.toFixed(1)}`, candidates: [], isbn: null, contrast };
}

// ── Fixture set ──────────────────────────────────────────────────────────────

function buildFixtures() {
  const fixtures = [];

  // 1. Real fixture from e2e/fixtures/ if it exists
  const realFixturePath = join(FIXTURE_DIR, 'book-spine-isbn.png');
  if (existsSync(realFixturePath)) {
    fixtures.push({
      name: 'real-fixture-9780306406157',
      type: 'real',
      filePath: realFixturePath,
      expectedIsbn: '9780306406157',
    });
  }

  // 2. Synthetic: clean ISBN-13
  fixtures.push({
    name: 'synthetic-clean-isbn13',
    type: 'synthetic',
    isbn: '9780306406157',
    opts: { scale: 24, pad: 24, noise: 0, brightness: 255 },
    expectedIsbn: '9780306406157',
  });

  // 3. Synthetic: noisy ISBN-13
  fixtures.push({
    name: 'synthetic-noisy-isbn13',
    type: 'synthetic',
    isbn: '9780306406157',
    opts: { scale: 24, pad: 24, noise: 40, brightness: 255 },
    expectedIsbn: '9780306406157',
  });

  // 4. Synthetic: dim/dark background
  fixtures.push({
    name: 'synthetic-dim-isbn13',
    type: 'synthetic',
    isbn: '9780141036144',
    opts: { scale: 24, pad: 24, noise: 10, brightness: 80 },
    expectedIsbn: '9780141036144',
  });

  // 5. Synthetic: inverted (light text on dark)
  fixtures.push({
    name: 'synthetic-inverted-isbn13',
    type: 'synthetic',
    isbn: '9780141036144',
    opts: { scale: 24, pad: 24, noise: 0, brightness: 255, invert: true },
    expectedIsbn: '9780141036144',
  });

  // 6. Synthetic: small scale (low resolution)
  fixtures.push({
    name: 'synthetic-lowres-isbn13',
    type: 'synthetic',
    isbn: '9780306406157',
    opts: { scale: 8, pad: 8, noise: 0, brightness: 255 },
    expectedIsbn: '9780306406157',
  });

  // 7. Text extraction: labeled ISBN
  fixtures.push({
    name: 'text-labeled-isbn13',
    type: 'text',
    text: 'Some book title\nISBN 978-0-306-40615-7\nAuthor Name',
    expectedIsbn: '9780306406157',
  });

  // 8. Text extraction: ISBN with OCR errors
  fixtures.push({
    name: 'text-ocr-errors-isbn13',
    type: 'text',
    text: 'ISBN 978-O-3O6-4O6I5-7',
    expectedIsbn: '9780306406157',
  });

  // 9. Text extraction: ISBN-10
  fixtures.push({
    name: 'text-isbn10',
    type: 'text',
    text: 'ISBN-10: 0-306-40615-2',
    expectedIsbn: '0306406152',
  });

  // 10. Text extraction: dense digits (no label)
  fixtures.push({
    name: 'text-unlabeled-isbn13',
    type: 'text',
    text: 'price $24.99 9780306406157 printed in USA',
    expectedIsbn: '9780306406157',
  });

  // 11. Checksum repair: single-digit error (pos 3: 0→8, ambiguity 8→[0,3,6,9])
  //     9780141036144 with pos 3 changed: 0→8 → 9788141036144
  //     repair iterates pos 0-12; first fix at pos 3: 8→0 → 9780141036144
  fixtures.push({
    name: 'repair-single-digit',
    type: 'repair',
    badIsbn: '9788141036144',
    expectedIsbn: '9780141036144',
  });

  // 12. Checksum repair: single-digit error (pos 5: 4→1, ambiguity 1→[7,4])
  //     9780141036144 with pos 5 changed: 4→1 → 9780111036144
  //     repair iterates pos 0-12; first fix at pos 5: 1→4 → 9780141036144
  fixtures.push({
    name: 'repair-middle-digit',
    type: 'repair',
    badIsbn: '9780111036144',
    expectedIsbn: '9780141036144',
  });

  // 13. Text extraction: multi-line ISBN
  fixtures.push({
    name: 'text-multiline-isbn',
    type: 'text',
    text: 'ISBN 978-0-306-\n40615-7',
    expectedIsbn: '9780306406157',
  });

  return fixtures;
}

// ── Run benchmarks ───────────────────────────────────────────────────────────

function runBenchmarks() {
  const fixtures = buildFixtures();
  const results = [];

  for (const fixture of fixtures) {
    if (fixture.type === 'synthetic') {
      const synth = generateSyntheticFixture(fixture.isbn, fixture.name, fixture.opts);
      const imageData = pngToImageData(synth.png);

      // Method 1: Direct bitmap OCR
      let t0 = performance.now();
      let result = benchmarkBitmapOcr(imageData, fixture.opts.scale, fixture.opts.pad);
      let duration = performance.now() - t0;
      results.push({
        fixture: fixture.name,
        method: 'bitmap-ocr',
        success: result.isbn === fixture.expectedIsbn,
        duration_ms: duration.toFixed(2),
        extracted_isbn: result.isbn || '',
        expected_isbn: fixture.expectedIsbn,
      });

      // Method 2: Otsu + bitmap OCR
      t0 = performance.now();
      result = benchmarkOtsuThenOcr(imageData, fixture.opts.scale, fixture.opts.pad);
      duration = performance.now() - t0;
      results.push({
        fixture: fixture.name,
        method: 'otsu+bitmap-ocr',
        success: result.isbn === fixture.expectedIsbn,
        duration_ms: duration.toFixed(2),
        extracted_isbn: result.isbn || '',
        expected_isbn: fixture.expectedIsbn,
      });

      // Method 3: Contrast measurement
      t0 = performance.now();
      result = benchmarkContrastMeasure(imageData);
      duration = performance.now() - t0;
      results.push({
        fixture: fixture.name,
        method: 'contrast-measure',
        success: true,  // informational
        duration_ms: duration.toFixed(2),
        extracted_isbn: result.rawText,
        expected_isbn: fixture.expectedIsbn,
      });

    } else if (fixture.type === 'real') {
      const imageData = readPngFixture(fixture.filePath);

      // Method 1: Contrast measurement
      let t0 = performance.now();
      let result = benchmarkContrastMeasure(imageData);
      let duration = performance.now() - t0;
      results.push({
        fixture: fixture.name,
        method: 'contrast-measure',
        success: true,
        duration_ms: duration.toFixed(2),
        extracted_isbn: result.rawText,
        expected_isbn: fixture.expectedIsbn,
      });

      // Method 2: Otsu binarization timing
      const copy = {
        data: new Uint8ClampedArray(imageData.data),
        width: imageData.width,
        height: imageData.height,
      };
      t0 = performance.now();
      applyOtsuBinarization(copy);
      duration = performance.now() - t0;
      results.push({
        fixture: fixture.name,
        method: 'otsu-binarization',
        success: true,
        duration_ms: duration.toFixed(2),
        extracted_isbn: '',
        expected_isbn: fixture.expectedIsbn,
      });

      // Method 3: Bitmap OCR on the real fixture
      t0 = performance.now();
      result = benchmarkBitmapOcr(imageData, 24, 24);
      duration = performance.now() - t0;
      results.push({
        fixture: fixture.name,
        method: 'bitmap-ocr',
        success: result.isbn === fixture.expectedIsbn,
        duration_ms: duration.toFixed(2),
        extracted_isbn: result.isbn || '',
        expected_isbn: fixture.expectedIsbn,
      });

    } else if (fixture.type === 'text') {
      const t0 = performance.now();
      const result = benchmarkTextExtraction(fixture.text);
      const duration = performance.now() - t0;
      results.push({
        fixture: fixture.name,
        method: 'text-extraction',
        success: result.isbn === fixture.expectedIsbn,
        duration_ms: duration.toFixed(2),
        extracted_isbn: result.isbn || '',
        expected_isbn: fixture.expectedIsbn,
      });

    } else if (fixture.type === 'repair') {
      const t0 = performance.now();
      const result = benchmarkChecksumRepair(fixture.badIsbn);
      const duration = performance.now() - t0;
      results.push({
        fixture: fixture.name,
        method: 'checksum-repair',
        success: result.isbn === fixture.expectedIsbn,
        duration_ms: duration.toFixed(2),
        extracted_isbn: result.isbn || '',
        expected_isbn: fixture.expectedIsbn,
      });
    }
  }

  return results;
}

// ── Output ───────────────────────────────────────────────────────────────────

function formatCsv(results) {
  const header = 'fixture,method,success,duration_ms,extracted_isbn,expected_isbn';
  const rows = results.map(r =>
    `${r.fixture},${r.method},${r.success},${r.duration_ms},${r.extracted_isbn},${r.expected_isbn}`
  );
  return [header, ...rows].join('\n');
}

function printSummary(results) {
  const total = results.length;
  const successes = results.filter(r => r.success).length;
  const failures = results.filter(r => !r.success);
  const durations = results.map(r => parseFloat(r.duration_ms));
  const totalTime = durations.reduce((a, b) => a + b, 0);
  const avgTime = total > 0 ? totalTime / total : 0;
  const maxTime = Math.max(...durations);
  const minTime = Math.min(...durations);

  // Group by method
  const byMethod = {};
  for (const r of results) {
    if (!byMethod[r.method]) byMethod[r.method] = { total: 0, success: 0, durations: [] };
    byMethod[r.method].total++;
    if (r.success) byMethod[r.method].success++;
    byMethod[r.method].durations.push(parseFloat(r.duration_ms));
  }

  console.log('\n' + '='.repeat(70));
  console.log('  SPINE-SCANNER BENCHMARK — Phase 25 Device Benchmark Runner');
  console.log('='.repeat(70));
  console.log(`\n  Total benchmarks:  ${total}`);
  console.log(`  Passed:            ${successes} / ${total} (${(successes / total * 100).toFixed(1)}%)`);
  console.log(`  Failed:            ${failures.length}`);
  console.log(`  Total time:        ${totalTime.toFixed(2)} ms`);
  console.log(`  Avg per benchmark: ${avgTime.toFixed(2)} ms`);
  console.log(`  Min duration:      ${minTime.toFixed(2)} ms`);
  console.log(`  Max duration:      ${maxTime.toFixed(2)} ms`);

  console.log('\n  By method:');
  for (const [method, stats] of Object.entries(byMethod)) {
    const avg = stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length;
    console.log(`    ${method.padEnd(20)} ${stats.success}/${stats.total} passed, avg ${avg.toFixed(2)} ms`);
  }

  if (failures.length > 0) {
    console.log('\n  Failed benchmarks:');
    for (const f of failures) {
      console.log(`    - ${f.fixture} [${f.method}]: got "${f.extracted_isbn}", expected "${f.expected_isbn}"`);
    }
  }

  console.log('\n' + '='.repeat(70) + '\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex >= 0 ? args[outIndex + 1] : null;

console.log('Running spine-scanner benchmarks...\n');

const results = runBenchmarks();
const csv = formatCsv(results);

if (outFile) {
  writeFileSync(outFile, csv + '\n', 'utf-8');
  console.log(`CSV written to: ${outFile}`);
} else {
  console.log(csv);
}

printSummary(results);
