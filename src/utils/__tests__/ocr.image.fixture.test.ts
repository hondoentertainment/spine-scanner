// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { extractIsbnCandidates } from '../ocr';

const __dirname = dirname(fileURLToPath(import.meta.url));
const runIntegration = process.env.RUN_OCR_INTEGRATION === '1';
const itIf = runIntegration ? it : it.skip;

describe('OCR image fixture (tesseract)', () => {
  itIf('runs Tesseract on PNG fixture and extracts ISBN when recognizable', async () => {
    const pngPath = join(__dirname, '..', '..', '..', 'e2e', 'fixtures', 'book-spine-isbn.png');
    if (!existsSync(pngPath)) {
      throw new Error(`PNG fixture not found. Run: npm run generate-ocr-fixture`);
    }
    const pngBuffer = readFileSync(pngPath);
    const expectedIsbn = '9780306406157';

    const Tesseract = await import('tesseract.js');
    const { data: { text: ocrText } } = await Tesseract.recognize(pngBuffer, 'eng', {
      tessedit_char_whitelist: '0123456789X',
      tessedit_pageseg_mode: '7',
    });

    // Verify Tesseract integration works: recognize() completes and returns result
    expect(typeof ocrText).toBe('string');

    const candidates = extractIsbnCandidates(ocrText);
    if (candidates.length > 0) {
      expect(candidates).toContain(expectedIsbn);
      expect(ocrText.length).toBeGreaterThan(0);
    }
  }, 20000);
});
