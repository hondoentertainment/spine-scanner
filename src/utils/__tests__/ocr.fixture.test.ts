import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { extractIsbnCandidates } from '../ocr';

describe('OCR fixture output', () => {
  it('extracts and ranks ISBNs from a noisy OCR fixture', () => {
    const fixturePath = join(__dirname, 'fixtures', 'ocr-output.txt');
    const text = readFileSync(fixturePath, 'utf-8');

    const candidates = extractIsbnCandidates(text);

    expect(candidates.length).toBeGreaterThan(0);
    // Prefer valid 978/979 ISBN-13 if present
    expect(candidates[0]).toBe('9780141036144');
    // Ensure we also detect other ISBNs in the fixture
    expect(candidates).toContain('0743273567');
  });
});
