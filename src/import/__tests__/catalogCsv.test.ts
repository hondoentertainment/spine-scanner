import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { BookEntry } from '../../types.ts';
import { isbn13To10 } from '../../utils/isbnValidation.ts';
import {
  CATALOG_PARSE_CHUNK,
  EMPTY_CATALOG_FILE,
  UNRECOGNIZED_CATALOG_FILE,
  cleanIsbn,
  importBooksInBatches,
  importFromGoodreadsCSV,
  importFromStoryGraphCSV,
  previewCatalogCsv,
  previewCatalogCsvAsync,
  titleAuthorKey,
} from '../catalogCsv.ts';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../__fixtures__');
const goodreadsFixture = readFileSync(join(fixtureDir, 'goodreads-tricky.csv'), 'utf8');
const storygraphFixture = readFileSync(join(fixtureDir, 'storygraph-tricky.csv'), 'utf8');

function existingBook(overrides: Partial<BookEntry>): BookEntry {
  return {
    id: 'existing',
    isbn: '',
    title: 'Already here',
    author: 'Someone',
    pageCount: 0,
    amazonLink: '',
    coverImg: '',
    status: 'read',
    notes: '',
    dateAdded: '2020-01-01T00:00:00.000Z',
    shelfIds: [],
    ...overrides,
  };
}

describe('catalog CSV fixtures', () => {
  it('parses a Goodreads export with quoted commas, formula ISBNs, missing ISBNs, and extra authors', () => {
    const result = previewCatalogCsv(goodreadsFixture, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.preview.format).toBe('goodreads');
    expect(result.preview.toImport).toHaveLength(4);
    expect(result.preview.duplicateCount).toBe(1);
    expect(result.preview.problems).toEqual([
      expect.objectContaining({ row: 5, message: 'Missing a title.' }),
    ]);
    expect(result.preview.missingIsbnCount).toBe(1);

    const [kindred, parable, fifth, dawn] = result.preview.toImport;
    expect(kindred.title).toBe('Kindred, the novel');
    expect(kindred.author).toBe('Octavia E. Butler');
    expect(kindred.isbn).toBe('9780441478125');
    expect(kindred.status).toBe('read');
    expect(kindred.pageCount).toBe(264);
    expect(kindred.notes).toBe('Rating: 5\nBrilliant, haunting.\nReread someday\nTags: classics, favorites');
    expect(kindred.finishedAt).toBe('2020-01-02T00:00:00.000Z');
    expect(kindred.dateAdded).toBe('2019-12-01T00:00:00.000Z');

    expect(parable.title).toBe('Parable of the Sower');
    expect(parable.isbn).toBe('');
    expect(parable.status).toBe('to-read');
    expect(parable.finishedAt).toBeNull();

    expect(fifth.author).toBe('N. K. Jemisin, Alaya Dawn Johnson');
    expect(fifth.status).toBe('reading');
    expect(fifth.isbn).toBe('9780316229296');

    expect(dawn.author).toBe('Octavia E. Butler, Sherley Anne Williams');
    expect(dawn.notes).toBe('Tags: owned');
  });

  it('parses a StoryGraph export with quoted commas, several authors, and a missing ISBN', () => {
    const result = previewCatalogCsv(storygraphFixture, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.preview.format).toBe('storygraph');
    expect(result.preview.toImport).toHaveLength(3);
    expect(result.preview.duplicateCount).toBe(1);
    expect(result.preview.problems).toEqual([
      expect.objectContaining({ row: 4, message: 'Missing a title.' }),
    ]);
    expect(result.preview.missingIsbnCount).toBe(1);

    const [leftHand, piranesi, ancillary] = result.preview.toImport;
    expect(leftHand.title).toBe('The Left Hand of Darkness, and other stories');
    expect(leftHand.author).toBe('Ursula K. Le Guin, Alice Sheldon');
    expect(leftHand.isbn).toBe('9780441478123');
    expect(leftHand.status).toBe('read');
    expect(leftHand.pageCount).toBe(304);
    expect(leftHand.seriesName).toBe('Hainish Cycle #4');
    expect(leftHand.seriesIndex).toBe(4);
    expect(leftHand.startedAt).toBe('2021-01-15T00:00:00.000Z');
    expect(leftHand.finishedAt).toBe('2021-02-02T00:00:00.000Z');
    expect(leftHand.notes).toBe('Rating: 4.5\nA masterpiece, truly\nTags: science-fiction, classic');

    expect(piranesi.isbn).toBe('');
    expect(piranesi.status).toBe('reading');
    expect(piranesi.startedAt).toBe('2024-03-01T00:00:00.000Z');
    expect(piranesi.finishedAt).toBeNull();
    expect(piranesi.notes).toBe('Tags: fantasy');

    expect(ancillary.status).toBe('dnf');
    expect(ancillary.finishedAt).toBe('2020-06-01T00:00:00.000Z');
    expect(ancillary.notes).toContain('Rating: 3');
    expect(ancillary.notes).toContain('Stopped halfway');
    expect(ancillary.seriesName).toBe('Imperial Radch #1');
  });
});

describe('catalog duplicate detection', () => {
  it('skips an ISBN already in the library, including ISBN-10 and ISBN-13 of the same book', () => {
    const csv = [
      'Title,Author,ISBN13,My Rating,Exclusive Shelf',
      'Nineteen Eighty-Four,George Orwell,="9780141036144",5,read',
    ].join('\n');
    const result = previewCatalogCsv(csv, [
      existingBook({ isbn: '0141036141', title: 'Different title', author: 'Different author' }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.toImport).toHaveLength(0);
    expect(result.preview.duplicateCount).toBe(1);
    expect(isbn13To10('9780141036144')).toBe('0141036141');
  });

  it('skips a book with the same normalized title and author when the ISBN is missing', () => {
    const result = previewCatalogCsv(goodreadsFixture, [
      existingBook({
        isbn: '',
        title: '  PARABLE of the sower! ',
        author: 'Octavia   E. Butler',
      }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.toImport.some((book) => book.title === 'Parable of the Sower')).toBe(false);
    expect(result.preview.duplicateCount).toBe(2);
    expect(titleAuthorKey('Parable of the Sower', 'Octavia E. Butler')).toBe(
      titleAuthorKey('  PARABLE of the sower! ', 'Octavia   E. Butler'),
    );
  });

  it('keeps distinct non-Latin titles instead of collapsing them to one key', () => {
    const csv = [
      'Title,Authors,ISBN/UID,Read Status',
      '吾輩は猫である,夏目漱石,9784101010014,read',
      '坊っちゃん,夏目漱石,9784101010038,read',
      'Преступление и наказание,Фёдор Достоевский,9780140449136,read',
      '吾輩は猫である,夏目漱石!,,read',
    ].join('\n');
    const result = previewCatalogCsv(csv, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.toImport.map((book) => book.title)).toEqual([
      '吾輩は猫である',
      '坊っちゃん',
      'Преступление и наказание',
    ]);
    expect(result.preview.duplicateCount).toBe(1);
    expect(titleAuthorKey('吾輩は猫である', '夏目漱石')).toBe(titleAuthorKey('吾輩は猫である', '夏目漱石!'));
    expect(titleAuthorKey('吾輩は猫である', '夏目漱石')).not.toBe(titleAuthorKey('坊っちゃん', '夏目漱石'));
  });

  it('does not treat two blank ISBNs as the same book', () => {
    const csv = [
      'Title,Author,ISBN13,My Rating,Exclusive Shelf',
      'One,Ada,,0,to-read',
      'Two,Ada,,0,to-read',
    ].join('\n');
    const result = previewCatalogCsv(csv, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.toImport).toHaveLength(2);
    expect(result.preview.duplicateCount).toBe(0);
  });
});

describe('catalog file errors', () => {
  it('rejects an empty file and a spreadsheet that is neither export', () => {
    expect(previewCatalogCsv('')).toEqual({ ok: false, error: EMPTY_CATALOG_FILE });
    expect(previewCatalogCsv('   \n  ')).toEqual({ ok: false, error: EMPTY_CATALOG_FILE });
    expect(previewCatalogCsv('Title,Author\nBook,Person')).toEqual({
      ok: false,
      error: UNRECOGNIZED_CATALOG_FILE,
    });
    expect(previewCatalogCsv('not,a,library\n1,2,3')).toEqual({
      ok: false,
      error: UNRECOGNIZED_CATALOG_FILE,
    });
  });

  it('accepts a header with no book rows', () => {
    const result = previewCatalogCsv('Title,Authors,Read Status\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.totalRows).toBe(0);
    expect(result.preview.toImport).toEqual([]);
  });

  it('strips Goodreads formula wrappers, including an empty one', () => {
    expect(cleanIsbn('="9780441478125"')).toBe('9780441478125');
    expect(cleanIsbn('=""')).toBe('');
    expect(cleanIsbn('="0441478123"')).toBe('0441478123');
    expect(cleanIsbn('978-0-441-47812-5')).toBe('9780441478125');
  });
});

describe('catalog import pacing', () => {
  it('reports progress while reading a few hundred rows and yields between chunks', async () => {
    const header = 'Title,Author,ISBN13,My Rating,Exclusive Shelf';
    const rows = Array.from({ length: CATALOG_PARSE_CHUNK + 10 }, (_, index) => (
      `Book ${index},Author ${index},978000000${String(index).padStart(4, '0')},0,to-read`
    ));
    const progress: Array<[number, number]> = [];
    const result = await previewCatalogCsvAsync([header, ...rows].join('\n'), [], (done, total) => {
      progress.push([done, total]);
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.toImport).toHaveLength(rows.length);
    expect(progress[0]).toEqual([CATALOG_PARSE_CHUNK, rows.length]);
    expect(progress.at(-1)).toEqual([rows.length, rows.length]);
  });

  it('writes books in batches and stops when cancelled', async () => {
    const books = Array.from({ length: 5 }, (_, index) => existingBook({
      id: `new-${index}`,
      title: `Book ${index}`,
      isbn: `978000000000${index}`,
    }));
    const committed: string[][] = [];
    const progress: number[] = [];
    let cancelled = false;
    const written = await importBooksInBatches(
      books,
      (batch) => {
        committed.push(batch.map((book) => book.id));
        if (committed.length === 1) cancelled = true;
      },
      (done) => progress.push(done),
      () => cancelled,
      2,
    );
    expect(written).toBe(2);
    expect(committed).toEqual([['new-0', 'new-1']]);
    expect(progress).toEqual([2]);
  });

  it('keeps the older Goodreads and StoryGraph helpers on the shared parser', () => {
    const goodreads = importFromGoodreadsCSV(goodreadsFixture, []);
    expect(goodreads.imported).toHaveLength(4);
    expect(goodreads.skipped).toBe(1);

    const added: BookEntry[] = [];
    const story = importFromStoryGraphCSV(storygraphFixture, [], (book) => added.push(book));
    expect(story.added).toBe(3);
    expect(story.duplicates).toBe(1);
    expect(story.errors).toEqual(['Row 4: Missing a title.']);
    expect(added).toHaveLength(3);
    expect(vi.isMockFunction(added.push)).toBe(false);
  });
});
