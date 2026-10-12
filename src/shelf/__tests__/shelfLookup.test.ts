import { describe, expect, it, vi } from 'vitest';
import { lookupShelfByTitleAuthor } from '../shelfLookup.ts';

const jsonResponse = (body: unknown, ok = true) => ({
  ok,
  json: async () => body,
});

describe('lookupShelfByTitleAuthor', () => {
  it('prefers Google Books and falls back to Open Library', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('googleapis.com')) {
        return jsonResponse({
          items: [{
            volumeInfo: {
              title: 'The Left Hand of Darkness',
              authors: ['Ursula K. Le Guin'],
              pageCount: 304,
              imageLinks: { thumbnail: 'https://books.google.com/cover.jpg' },
              industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780441478125' }],
            },
          }],
        });
      }
      return jsonResponse({ docs: [] });
    });

    const hit = await lookupShelfByTitleAuthor('The Left Hand of Darkness', 'Ursula K. Le Guin', fetchImpl as unknown as typeof fetch);
    expect(hit).toMatchObject({
      title: 'The Left Hand of Darkness',
      author: 'Ursula K. Le Guin',
      isbn: '9780441478125',
      pageCount: 304,
      source: 'google_books',
    });
  });

  it('uses Open Library when Google has no hit', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('googleapis.com')) return jsonResponse({ totalItems: 0 });
      return jsonResponse({
        docs: [{
          title: 'Kindred',
          author_name: ['Octavia E. Butler'],
          number_of_pages_median: 264,
          cover_i: 42,
          isbn: ['0807083690', '9780807083697'],
        }],
      });
    });
    const hit = await lookupShelfByTitleAuthor('Kindred', 'Octavia E. Butler', fetchImpl as unknown as typeof fetch);
    expect(hit).toMatchObject({
      title: 'Kindred',
      isbn: '9780807083697',
      thumbnail: 'https://covers.openlibrary.org/b/id/42-M.jpg',
      source: 'open_library',
    });
  });

  it('returns null offline and skips unknown titles', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(lookupShelfByTitleAuthor('Dune', 'Frank Herbert', fetchImpl as unknown as typeof fetch)).resolves.toBeNull();
    await expect(lookupShelfByTitleAuthor('Unknown Title', '', fetchImpl as unknown as typeof fetch)).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
