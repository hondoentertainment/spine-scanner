import { describe, it, expect } from 'vitest';
import { extractIsbnCandidates, fixOcrDigits } from '../ocr';

describe('OCR helpers', () => {
  it('normalizes common OCR digit misreads', () => {
    const raw = 'O1ISB8GZ';
    expect(fixOcrDigits(raw)).toBe('01158892');
  });

  it('extracts ISBN candidates from raw text', () => {
    const text = 'Random text 978-0-14-103614-4 more text';
    const candidates = extractIsbnCandidates(text);
    expect(candidates[0]).toBe('9780141036144');
  });

  it('extracts ISBN candidates from labeled text', () => {
    const text = 'ISBN 0-7432-7356-7';
    const candidates = extractIsbnCandidates(text);
    expect(candidates[0]).toBe('0743273567');
  });

  it('dedupes and ranks valid ISBN-13 before ISBN-10', () => {
    const text = 'ISBN: 0743273567 and 9780141036144';
    const candidates = extractIsbnCandidates(text);
    expect(candidates[0]).toBe('9780141036144');
    expect(candidates).toContain('0743273567');
  });

  it('prefers 978/979 ISBN-13', () => {
    const text = 'ISBN 9780306406157 and 9771234567890';
    const candidates = extractIsbnCandidates(text);
    expect(candidates[0]).toBe('9780306406157');
  });

  it('falls back to invalid candidates if no valid ISBNs exist', () => {
    const text = 'ISBN 9780306406158'; // invalid checksum
    const candidates = extractIsbnCandidates(text);
    expect(candidates[0]).toBe('9780306406158');
  });

  it('handles OCR-mangled characters', () => {
    const text = 'ISBN 97B-0l4-1O3614-4'; // B->8, l->1, O->0
    const candidates = extractIsbnCandidates(text);
    expect(candidates[0]).toBe('9780141036144');
  });
});
