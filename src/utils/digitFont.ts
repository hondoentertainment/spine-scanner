/**
 * 5×7 bitmap font for digits 0–9.
 * Shared with scripts/generate-ocr-fixture.mjs (via scripts/digitFont.json).
 */
import fontData from './digitFont.json';
export const DIGIT_FONT = fontData as Record<string, string[]>;
export const GLYPH_W = 5;
export const GLYPH_H = 7;
