import { describe, expect, it } from 'vitest';
import { openLibrarySubjects, parseGoogleVolumes, parseOpenLibrarySearch } from '../sources.ts';
import { readLlmConfig, parseLlmRecommendations } from '../llm.ts';

describe('metadata parsers', () => {
  it('reads an Open Library search doc', () => {
    const parsed = parseOpenLibrarySearch({
      docs: [{
        title: 'Dune Messiah',
        author_name: ['Frank Herbert'],
        isbn: ['0441172695', '9780441013593'],
        subject: ['Science fiction', 'Fiction'],
        cover_i: 42,
        number_of_pages_median: 336,
      }],
    });
    expect(parsed[0]).toMatchObject({
      title: 'Dune Messiah',
      author: 'Frank Herbert',
      source: 'open_library',
      pageCount: 336,
      coverImg: 'https://covers.openlibrary.org/b/id/42-M.jpg',
    });
    expect(parsed[0].subjects).toContain('Science fiction');
    expect(parsed[0].isbns.length).toBeGreaterThan(0);
  });

  it('reads subjects from an ISBN lookup that does not include a title', () => {
    expect(openLibrarySubjects({
      docs: [{ subject: ['Science fiction', 'Fiction'] }],
    })).toEqual(['Science fiction', 'Fiction']);
  });

  it('reads a Google Books volume and upgrades the cover to https', () => {
    const parsed = parseGoogleVolumes({
      items: [{
        volumeInfo: {
          title: 'Dune Messiah',
          authors: ['Frank Herbert'],
          printType: 'BOOK',
          pageCount: 336,
          categories: ['Fiction / Science Fiction'],
          industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780441013593' }],
          imageLinks: { thumbnail: 'http://books.google.com/cover.jpg' },
        },
      }, {
        volumeInfo: { title: 'A Magazine', authors: ['Editor'], printType: 'MAGAZINE' },
      }],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].coverImg).toBe('https://books.google.com/cover.jpg');
    expect(parsed[0].subjects).toEqual(['Fiction', 'Science Fiction']);
    expect(parsed[0].isbn).toBe('9780441013593');
  });
});

describe('optional suggestions endpoint', () => {
  it('stays off unless the flag and an https endpoint are both set', () => {
    expect(readLlmConfig({})).toBeNull();
    expect(readLlmConfig({ VITE_RECOMMENDATIONS_LLM: 'true' })).toBeNull();
    expect(readLlmConfig({
      VITE_RECOMMENDATIONS_LLM: 'true',
      VITE_RECOMMENDATIONS_LLM_ENDPOINT: 'http://evil.example/recommendations',
    })).toBeNull();
    expect(readLlmConfig({
      VITE_RECOMMENDATIONS_LLM: 'true',
      VITE_RECOMMENDATIONS_LLM_ENDPOINT: 'https://suggestions.example/recommendations',
    })).toEqual({ endpoint: 'https://suggestions.example/recommendations' });
    expect(readLlmConfig({
      VITE_RECOMMENDATIONS_LLM: 'true',
      VITE_RECOMMENDATIONS_LLM_ENDPOINT: 'http://localhost:8787/recommendations',
    })?.endpoint).toBe('http://localhost:8787/recommendations');
  });

  it('drops malformed rows and keeps a usable suggestion', () => {
    const parsed = parseLlmRecommendations({
      recommendations: [
        { title: 'The Left Hand of Darkness', author: 'Ursula K. Le Guin', reason: 'Because you own Dune' },
        { title: '', author: 'Nobody' },
        'nope',
      ],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed?.[0].source).toBe('llm');
    expect(parseLlmRecommendations({ nope: true })).toBeNull();
  });
});
