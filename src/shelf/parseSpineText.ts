import { extractIsbnCandidates } from '../utils/ocr.ts';
import { isValidIsbn } from '../utils/isbnValidation.ts';

export interface ParsedSpineText {
  title: string;
  author: string;
  isbn: string | null;
  confidence: number;
}

const looksLikeAuthor = (line: string): boolean => {
  if (/^(the|a|an)\b/i.test(line)) return false;
  const words = line.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  return words.every((word) => /^[A-Z][a-zA-Z.'’-]*$/.test(word) || /^[A-Z]\.$/.test(word));
};

const isIsbnLine = (line: string, isbn: string | null): boolean => {
  if (/^isbn\b/i.test(line)) return true;
  const digits = line.replace(/[^0-9Xx]/g, '');
  if (isbn && digits.includes(isbn)) return true;
  return digits.length >= 10 && digits.length <= 13 && digits.length / Math.max(line.replace(/\s/g, '').length, 1) > 0.6;
};

/**
 * Turn one spine's OCR block into a title, author, and ISBN candidate.
 * ISBN parsing reuses the single-spine extractor so checksum rules stay shared.
 */
export function parseSpineText(raw: string): ParsedSpineText {
  const text = (raw ?? '').replace(/\r/g, '\n');
  const isbn = extractIsbnCandidates(text).find((candidate) => isValidIsbn(candidate)) ?? null;
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isIsbnLine(line, isbn));

  let author = '';
  const byLine = lines.find((line) => /^by\s+/i.test(line));
  if (byLine) {
    author = byLine.replace(/^by\s+/i, '').trim();
  } else {
    const nameLines = lines.filter((line) => looksLikeAuthor(line));
    if (nameLines.length === 1 && lines.length > 1) {
      author = nameLines[0];
    } else if (nameLines.length > 1) {
      author = nameLines.slice().sort((a, b) => a.length - b.length)[0];
    }
  }

  const titlePool = lines
    .filter((line) => line !== byLine && line !== author)
    .map((line) => line.replace(/^by\s+/i, '').trim())
    .filter(Boolean);
  const title = titlePool.slice().sort((a, b) => b.length - a.length)[0] ?? '';

  let confidence = 0.3;
  if (title) confidence += 0.3;
  if (author) confidence += 0.15;
  if (isbn) confidence += 0.25;

  return {
    title: title || 'Unknown Title',
    author: author || 'Unknown Author',
    isbn,
    confidence: Math.min(0.95, confidence),
  };
}
