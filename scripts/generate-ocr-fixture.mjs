#!/usr/bin/env node
/**
 * Generates an SVG fixture with ISBN text for E2E OCR testing.
 * Browser rasterization gives Tesseract normal glyph shapes instead of a pixel font.
 * Run: node scripts/generate-ocr-fixture.mjs
 */

import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ISBN = '9780306406157';
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="520" viewBox="0 0 1400 520">
  <rect width="1400" height="520" fill="#ffffff"/>
  <text x="700" y="205" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="96" font-weight="700"
        letter-spacing="8" fill="#111111">ISBN ${ISBN}</text>
  <text x="700" y="340" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="104" font-weight="700"
        letter-spacing="12" fill="#111111">${ISBN}</text>
</svg>
`;

const outDir = join(__dirname, '..', 'e2e', 'fixtures');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'book-spine-isbn.svg');
writeFileSync(outPath, svg);
console.log(`Generated ${outPath} (${ISBN})`);
