import { isValidIsbn } from './isbnValidation.ts';

export const fixOcrDigits = (str: string): string =>
  str.replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8')
    .replace(/[Gg]/g, '9')
    .replace(/[Zz]/g, '2');

export const extractIsbnCandidates = (text: string): string[] => {
  const candidates: string[] = [];

  for (const source of [text, fixOcrDigits(text)]) {
    const matches = source.match(/[0-9][- 0-9]{8,17}[0-9X]/g);
    if (matches) {
      for (const m of matches) {
        const clean = m.replace(/[^0-9X]/g, '');
        if (clean.length === 13 || clean.length === 10) candidates.push(clean);
      }
    }
  }

  const isbnLabel = text.match(/ISBN[- ]?(?:1[03])?[: ]?\s*([0-9X][- 0-9X]{9,17})/gi);
  if (isbnLabel) {
    for (const m of isbnLabel) {
      const digits = m.replace(/[^0-9X]/g, '');
      if (digits.length === 13 || digits.length === 10) candidates.push(digits);
    }
  }

  const deduped = Array.from(new Set(candidates));
  const valid = deduped.filter(c => isValidIsbn(c));
  const invalid = deduped.filter(c => !isValidIsbn(c));

  const valid13 = valid.filter(c => c.length === 13);
  const valid13Pref = valid13.filter(c => c.startsWith('978') || c.startsWith('979'));
  const valid13Other = valid13.filter(c => !valid13Pref.includes(c));
  const valid10 = valid.filter(c => c.length === 10);

  return [...valid13Pref, ...valid13Other, ...valid10, ...invalid];
};
