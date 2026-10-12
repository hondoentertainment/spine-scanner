import { describe, expect, it } from 'vitest';
import { parseSpineText } from '../parseSpineText.ts';

describe('parseSpineText', () => {
  it('reads a title, a by-line, and a valid ISBN', () => {
    const parsed = parseSpineText('The Left Hand of Darkness\nby Ursula K. Le Guin\nISBN 978-0-441-47812-5');
    expect(parsed.title).toBe('The Left Hand of Darkness');
    expect(parsed.author).toBe('Ursula K. Le Guin');
    expect(parsed.isbn).toBe('9780441478125');
    expect(parsed.confidence).toBeGreaterThan(0.6);
  });

  it('treats a short personal name as the author when a longer title is present', () => {
    const parsed = parseSpineText('Dune\nFrank Herbert');
    expect(parsed.title).toBe('Dune');
    expect(parsed.author).toBe('Frank Herbert');
  });

  it('does not invent an author from a single title line', () => {
    const parsed = parseSpineText('The Dispossessed');
    expect(parsed.title).toBe('The Dispossessed');
    expect(parsed.author).toBe('Unknown Author');
    expect(parsed.isbn).toBeNull();
  });
});
