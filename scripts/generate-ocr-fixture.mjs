#!/usr/bin/env node
/**
 * Generates a PNG fixture with ISBN digits for E2E OCR testing.
 * Uses the same 5x7 bitmap font as ocr.image.fixture.test.ts.
 * Run: node scripts/generate-ocr-fixture.mjs
 */

import { PNG } from 'pngjs';
import { createWriteStream, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIGIT_FONT = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'utils', 'digitFont.json'), 'utf-8'));

const ISBN = '9780306406157';
const GLYPH_W = 5;
const GLYPH_H = 7;
/** Larger scale improves Tesseract recognition; 24+ recommended for consistent OCR */
const SCALE = 24;
const PAD = 24;
const width = PAD * 2 + ISBN.length * (GLYPH_W * SCALE + SCALE) - SCALE;
const height = PAD * 2 + GLYPH_H * SCALE;

const png = new PNG({ width, height, filterType: -1 });

function pixel(x, y) {
  const gx = x - PAD;
  const gy = y - PAD;
  if (gx < 0 || gy < 0 || gx >= width - PAD * 2 || gy >= GLYPH_H * SCALE) return 255;
  const charIndex = Math.floor(gx / (GLYPH_W * SCALE + SCALE));
  const withinChar = gx % (GLYPH_W * SCALE + SCALE);
  if (withinChar >= GLYPH_W * SCALE) return 255;
  const digit = ISBN[charIndex];
  const col = Math.floor(withinChar / SCALE);
  const row = Math.floor(gy / SCALE);
  const pattern = DIGIT_FONT[digit]?.[row];
  if (!pattern) return 255;
  return pattern[col] === '1' ? 0 : 255;
}

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const v = pixel(x, y);
    const idx = (width * y + x) << 2;
    png.data[idx] = v;
    png.data[idx + 1] = v;
    png.data[idx + 2] = v;
    png.data[idx + 3] = 255;
  }
}

const outDir = join(__dirname, '..', 'e2e', 'fixtures');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'book-spine-isbn.png');
png.pack().pipe(createWriteStream(outPath)).on('finish', () => {
  console.log(`Generated ${outPath} (${ISBN})`);
});
