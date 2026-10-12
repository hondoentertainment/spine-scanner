import { describe, expect, it } from 'vitest';
import type { OwnedBookSignal, CatalogCandidate } from '../types.ts';
import {
  acceptShelfReason,
  authorKey,
  becauseYouOwn,
  editionKey,
  isAlreadyInLibrary,
  isDistinctiveSubject,
  libraryFingerprint,
  normalizeSubject,
  rankRecommendations,
} from '../rank.ts';

const owned = (overrides: Partial<OwnedBookSignal> = {}): OwnedBookSignal => ({
  id: overrides.id ?? 'id',
  title: overrides.title ?? 'Dune',
  author: overrides.author ?? 'Frank Herbert',
  isbn: overrides.isbn ?? '9780441172719',
  subjects: overrides.subjects ?? [],
  seriesName: overrides.seriesName,
  isPhotoOnly: overrides.isPhotoOnly,
});

const candidate = (overrides: Partial<CatalogCandidate> = {}): CatalogCandidate => ({
  title: overrides.title ?? 'Dune Messiah',
  author: overrides.author ?? 'Frank Herbert',
  isbn: overrides.isbn ?? '9780441013593',
  isbns: overrides.isbns ?? [overrides.isbn ?? '9780441013593'],
  pageCount: overrides.pageCount ?? 336,
  coverImg: overrides.coverImg ?? '',
  subjects: overrides.subjects ?? [],
  seriesName: overrides.seriesName,
  source: overrides.source ?? 'open_library',
  reason: overrides.reason,
});

describe('becauseYouOwn', () => {
  it('names one shelf title', () => {
    expect(becauseYouOwn(['Dune'])).toBe('Because you own Dune');
  });

  it('names two shelf titles with and', () => {
    expect(becauseYouOwn(['Dune', 'Hyperion'])).toBe('Because you own Dune and Hyperion');
  });

  it('keeps the sentence short when more than two titles match', () => {
    expect(becauseYouOwn(['Dune', 'Hyperion', 'Foundation', 'Neuromancer'])).toBe(
      'Because you own Dune, Hyperion, and 2 more',
    );
  });
});

describe('shelf identity', () => {
  it('treats inverted author names as the same person', () => {
    expect(authorKey('Herbert, Frank')).toBe(authorKey('Frank Herbert'));
    expect(authorKey('Le Guin, Ursula K.')).toBe(authorKey('Ursula K. Le Guin'));
  });

  it('uses the first author when two people are listed', () => {
    expect(authorKey('Frank Herbert, Brian Herbert')).toBe(authorKey('Frank Herbert'));
  });

  it('folds science-fiction subject spellings together and drops generic ones', () => {
    expect(normalizeSubject('Science_Fiction')).toBe('science fiction');
    expect(isDistinctiveSubject(normalizeSubject('Fiction'))).toBe(false);
    expect(isDistinctiveSubject(normalizeSubject('Science Fiction'))).toBe(true);
  });

  it('matches a paperback edition of a book already on the shelf', () => {
    const library = [owned({ title: 'Dune', author: 'Frank Herbert', isbn: '9780441172719' })];
    expect(editionKey('Dune (Paperback)', 'Herbert, Frank')).toBe(editionKey('Dune', 'Frank Herbert'));
    expect(isAlreadyInLibrary(
      { title: 'Dune (Paperback)', author: 'Herbert, Frank', isbn: '9780441007462' },
      library,
    )).toBe(true);
  });

  it('treats ISBN-10 and ISBN-13 as the same copy', () => {
    const library = [owned({ isbn: '9780141036144', title: '1984', author: 'George Orwell' })];
    expect(isAlreadyInLibrary({ title: 'Nineteen Eighty-Four', author: 'Orwell, George', isbn: '0141036141' }, library)).toBe(true);
  });
});

describe('rankRecommendations', () => {
  const dune = owned({ id: 'dune', title: 'Dune', author: 'Frank Herbert', isbn: '9780441172719', subjects: ['Science fiction', 'Fiction'] });
  const hyperion = owned({
    id: 'hyperion',
    title: 'Hyperion',
    author: 'Dan Simmons',
    isbn: '9780553283686',
    subjects: ['Science fiction', 'Space opera'],
  });

  it('explains a shared subject with the two shelf titles', () => {
    const ranked = rankRecommendations([
      candidate({
        title: 'The Left Hand of Darkness',
        author: 'Ursula K. Le Guin',
        isbn: '9780441007462',
        isbns: ['9780441007462'],
        subjects: ['Science fiction'],
      }),
    ], [dune, hyperion]);

    expect(ranked).toHaveLength(1);
    expect(ranked[0].reason).toBe('Because you own Dune and Hyperion');
    expect(ranked[0].becauseTitles).toEqual(['Dune', 'Hyperion']);
  });

  it('explains a same-author suggestion with the shelf book', () => {
    const ranked = rankRecommendations([
      candidate({ title: 'Dune Messiah', subjects: ['Science fiction'] }),
    ], [dune, hyperion]);

    expect(ranked.map((item) => item.title)).toEqual(['Dune Messiah']);
    expect(ranked[0].reason).toBe('Because you own Dune');
  });

  it('drops books already on the shelf, including another edition', () => {
    const ranked = rankRecommendations([
      candidate({ title: 'Dune', isbn: '9780441172719', isbns: ['9780441172719'] }),
      candidate({
        title: 'Dune (Paperback)',
        author: 'Herbert, Frank',
        isbn: '9780441007462',
        isbns: ['9780441007462'],
        subjects: ['Science fiction'],
      }),
      candidate({ title: 'Dune Messiah', isbn: '9780441013593', isbns: ['9780441013593'] }),
    ], [dune]);

    expect(ranked.map((item) => item.title)).toEqual(['Dune Messiah']);
  });

  it('does not suggest a book that only shares a generic subject', () => {
    const ranked = rankRecommendations([
      candidate({
        title: 'A Cookbook',
        author: 'Someone Else',
        isbn: '9780441007462',
        isbns: ['9780441007462'],
        subjects: ['Fiction'],
      }),
    ], [dune, hyperion]);
    expect(ranked).toEqual([]);
  });

  it('prefers the series the shelf already has', () => {
    const ranked = rankRecommendations([
      candidate({
        title: 'Children of Dune',
        isbn: '9780441013593',
        isbns: ['9780441013593'],
        seriesName: 'Dune',
        subjects: ['Science fiction'],
      }),
    ], [
      { ...dune, seriesName: 'Dune' },
      hyperion,
    ]);
    expect(ranked[0].reason).toBe('Because you own Dune');
  });

  it('names two shelf books and counts the rest', () => {
    const shelf = ['Dune', 'Hyperion', 'Foundation', 'Neuromancer'].map((title, index) => owned({
      id: `b${index}`,
      title,
      author: `Author ${index}`,
      isbn: `978044100746${index}`,
      subjects: ['Science fiction'],
    }));
    const ranked = rankRecommendations([
      candidate({
        title: 'The Dispossessed',
        author: 'Ursula K. Le Guin',
        isbn: '9780061054884',
        isbns: ['9780061054884'],
        subjects: ['Science fiction'],
      }),
    ], shelf);
    expect(ranked[0].reason).toBe('Because you own Dune, Hyperion, and 2 more');
    expect(ranked[0].becauseTitles).toEqual(['Dune', 'Hyperion']);
  });

  it('keeps at most three suggestions for one author', () => {
    const suggestions = [1, 2, 3, 4].map((n) => candidate({
      title: `Herbert Book ${n}`,
      isbn: `978044101359${n}`,
      isbns: [`978044101359${n}`],
    }));
    const ranked = rankRecommendations(suggestions, [dune]);
    expect(ranked).toHaveLength(3);
    expect(ranked.every((item) => item.reason === 'Because you own Dune')).toBe(true);
  });

  it('uses an external reason only when every cited title is on the shelf', () => {
    expect(acceptShelfReason('Because you own Dune and Hyperion', ['Dune', 'Hyperion'])?.reason)
      .toBe('Because you own Dune and Hyperion');
    expect(acceptShelfReason('Because you own Pride and Prejudice.', ['Pride and Prejudice'])?.becauseTitles)
      .toEqual(['Pride and Prejudice']);
    expect(acceptShelfReason('Because you own Dune and Not A Real Book', ['Dune', 'Hyperion'])).toBeNull();
    expect(acceptShelfReason('You might like Dune', ['Dune'])).toBeNull();

    const ranked = rankRecommendations([
      candidate({
        title: 'The Left Hand of Darkness',
        author: 'Ursula K. Le Guin',
        isbn: '9780441007462',
        isbns: ['9780441007462'],
        reason: 'Because you own Dune and Hyperion',
        source: 'llm',
      }),
    ], [dune, hyperion]);
    expect(ranked[0].reason).toBe('Because you own Dune and Hyperion');
    expect(ranked[0].source).toBe('llm');
  });

  it('builds the same fingerprint regardless of shelf order', () => {
    const a = owned({ title: 'Dune', isbn: '9780441172719' });
    const b = owned({ title: 'Hyperion', author: 'Dan Simmons', isbn: '9780553283686' });
    expect(libraryFingerprint([a, b])).toBe(libraryFingerprint([b, a]));
  });
});
