import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { extractIsbnCandidates } from '../ocr';

const DIGIT_FONT: Record<string, string[]> = {
  '0': [
    '01110',
    '10001',
    '10011',
    '10101',
    '11001',
    '10001',
    '01110',
  ],
  '1': [
    '00100',
    '01100',
    '00100',
    '00100',
    '00100',
    '00100',
    '01110',
  ],
  '2': [
    '01110',
    '10001',
    '00001',
    '00010',
    '00100',
    '01000',
    '11111',
  ],
  '3': [
    '11110',
    '00001',
    '00001',
    '01110',
    '00001',
    '00001',
    '11110',
  ],
  '4': [
    '00010',
    '00110',
    '01010',
    '10010',
    '11111',
    '00010',
    '00010',
  ],
  '5': [
    '11111',
    '10000',
    '10000',
    '11110',
    '00001',
    '00001',
    '11110',
  ],
  '6': [
    '01110',
    '10000',
    '10000',
    '11110',
    '10001',
    '10001',
    '01110',
  ],
  '7': [
    '11111',
    '00001',
    '00010',
    '00100',
    '01000',
    '01000',
    '01000',
  ],
  '8': [
    '01110',
    '10001',
    '10001',
    '01110',
    '10001',
    '10001',
    '01110',
  ],
  '9': [
    '01110',
    '10001',
    '10001',
    '01111',
    '00001',
    '00001',
    '01110',
  ],
};

const buildPpmFromDigits = (digits: string, scale = 12, pad = 12): Buffer => {
  const glyphW = 5;
  const glyphH = 7;
  const width = pad * 2 + digits.length * (glyphW * scale + scale) - scale;
  const height = pad * 2 + glyphH * scale;

  const pixel = (x: number, y: number): number => {
    const gx = x - pad;
    const gy = y - pad;
    if (gx < 0 || gy < 0 || gx >= width - pad * 2 || gy >= glyphH * scale) return 255;
    const charIndex = Math.floor(gx / (glyphW * scale + scale));
    const withinChar = gx % (glyphW * scale + scale);
    if (withinChar >= glyphW * scale) return 255;
    const digit = digits[charIndex];
    const col = Math.floor(withinChar / scale);
    const row = Math.floor(gy / scale);
    const pattern = DIGIT_FONT[digit]?.[row];
    if (!pattern) return 255;
    return pattern[col] === '1' ? 0 : 255;
  };

  const header = `P3\n${width} ${height}\n255\n`;
  let body = '';
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const v = pixel(x, y);
      body += `${v} ${v} ${v} `;
    }
    body += '\n';
  }
  return Buffer.from(header + body, 'utf-8');
};

const runIntegration = process.env.RUN_OCR_INTEGRATION === '1';
const itIf = runIntegration ? it : it.skip;

describe('OCR image fixture (tesseract)', () => {
  itIf('recognizes the ISBN from a rendered PPM fixture', async () => {
    const fixturePath = join(__dirname, 'fixtures', 'ocr-image-fixture.json');
    const { text } = JSON.parse(readFileSync(fixturePath, 'utf-8')) as { text: string };

    const ppmBuffer = buildPpmFromDigits(text);

    const Tesseract = await import('tesseract.js');
    const { data: { text: ocrText } } = await Tesseract.recognize(ppmBuffer, 'eng', {
      tessedit_char_whitelist: '0123456789X',
      tessedit_pageseg_mode: '7',
    });

    const candidates = extractIsbnCandidates(ocrText);
    expect(candidates[0]).toBe(text);
  }, 20000);
});
