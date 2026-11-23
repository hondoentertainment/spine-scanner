import type { BookEntry } from '../types.ts';
import { isValidIsbn, isbn10To13, isbn13To10, normalizeToIsbn13 } from '../utils/isbnValidation.ts';

/**
 * Goodreads and StoryGraph library CSV import.
 * Parsing stays in the browser. Nothing here calls a paid API.
 */

export interface ImportResult {
  added: number;
  duplicates: number;
  errors: string[];
}

export interface CatalogProblem {
  /** 1-based CSV record number. The header is record 1. */
  row: number;
  message: string;
}

export type CatalogFormat = 'goodreads' | 'storygraph';

export interface CatalogPreview {
  format: CatalogFormat;
  formatLabel: string;
  toImport: BookEntry[];
  duplicateCount: number;
  problems: CatalogProblem[];
  /** Data rows under the header, including duplicates and problem rows. */
  totalRows: number;
  missingIsbnCount: number;
}

export type CatalogParseResult =
  | { ok: true; preview: CatalogPreview }
  | { ok: false; error: string };

export const EMPTY_CATALOG_FILE = 'This file is empty. Choose a Goodreads or StoryGraph CSV export.';

export const UNRECOGNIZED_CATALOG_FILE =
  'This file does not look like a Goodreads or StoryGraph export. From Goodreads, open My Books, then Import/Export, then Export Library. From StoryGraph, open Account, then Import/Export, then Export your library.';

const FORMAT_LABEL: Record<CatalogFormat, string> = {
  goodreads: 'Goodreads',
  storygraph: 'StoryGraph',
};

/** Rows processed before yielding back to the browser so a few thousand rows stay responsive. */
export const CATALOG_PARSE_CHUNK = 250;

/** Books written per store update during import. */
export const CATALOG_WRITE_BATCH = 100;

interface PreparedCatalog {
  format: CatalogFormat;
  headers: string[];
  rows: string[];
}

interface DuplicateIndex {
  isbns: Set<string>;
  titleAuthors: Set<string>;
}

export function normalizeMatchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function titleAuthorKey(title: string, author: string): string {
  return `${normalizeMatchText(title)}|${normalizeMatchText(author)}`;
}

/**
 * Strips the Goodreads Excel formula wrapper (`="978..."`) and hyphenation.
 * A non-ISBN token such as a StoryGraph UID is kept so it can still dedupe.
 */
export function cleanIsbn(raw: string): string {
  let value = raw.trim();
  for (let i = 0; i < 3; i += 1) {
    const wrapped = value.match(/^=\s*"([^"]*)"\s*$/);
    if (wrapped) {
      value = wrapped[1].trim();
      continue;
    }
    if (value.startsWith('=')) {
      value = value.slice(1).replace(/^"+|"+$/g, '').trim();
      continue;
    }
    break;
  }
  value = value.replace(/^"+|"+$/g, '').trim();
  if (!value) return '';
  const compact = value.replace(/[\s-]/g, '');
  const digits = compact.replace(/[^0-9Xx]/g, '').replace(/x$/i, 'X');
  if (digits.length === 10 || digits.length === 13) return digits;
  return compact;
}

function isbnLookupKeys(raw: string): string[] {
  const cleaned = cleanIsbn(raw);
  if (!cleaned) return [];
  const keys = new Set<string>([cleaned.toLowerCase()]);
  // Only a checksum-valid ISBN is the same book as its 10/13 twin.
  // Raw export ids that merely look numeric stay distinct.
  if (!isValidIsbn(cleaned)) return [...keys];
  if (cleaned.length === 10) {
    const isbn13 = isbn10To13(cleaned);
    if (isbn13) keys.add(isbn13);
  }
  if (cleaned.length === 13) {
    const isbn10 = isbn13To10(cleaned);
    if (isbn10) keys.add(isbn10.toLowerCase());
  }
  return [...keys];
}

function rememberIsbn(index: DuplicateIndex, raw: string): void {
  for (const key of isbnLookupKeys(raw)) index.isbns.add(key);
}

function isbnIsDuplicate(index: DuplicateIndex, raw: string): boolean {
  return isbnLookupKeys(raw).some((key) => index.isbns.has(key));
}

export function storedIsbn(raw: string): string {
  const cleaned = cleanIsbn(raw);
  if (!cleaned) return '';
  if ((cleaned.length === 10 || cleaned.length === 13) && isValidIsbn(cleaned)) {
    return normalizeToIsbn13(cleaned);
  }
  return cleaned;
}

/** ISO-8601 timestamp for a calendar date. Date-only values stay at UTC midnight so they round-trip. */
export function parseImportDate(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const match = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!match) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day)).toISOString();
}

function splitCSVRows(text: string): string[] {
  const rows: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '""';
        i += 1;
      } else {
        inQuotes = !inQuotes;
        current += ch;
      }
    } else if ((ch === '\r' || ch === '\n') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      if (current.trim() !== '') rows.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim() !== '') rows.push(current);
  return rows;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let val = '';
      i += 1;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          val += '"';
          i += 2;
        } else if (line[i] === '"') {
          i += 1;
          break;
        } else {
          val += line[i];
          i += 1;
        }
      }
      fields.push(val);
      if (i < line.length && line[i] === ',') i += 1;
    } else {
      const end = line.indexOf(',', i);
      if (end === -1) {
        fields.push(line.slice(i).trim());
        break;
      }
      fields.push(line.slice(i, end).trim());
      i = end + 1;
    }
  }
  if (line.endsWith(',')) fields.push('');
  return fields;
}

function headerNames(headers: string[]): Set<string> {
  return new Set(headers.map((header) => header.trim().toLowerCase()));
}

export function detectCatalogFormat(headers: string[]): CatalogFormat | null {
  const names = headerNames(headers);
  const has = (name: string) => names.has(name);
  if (!has('title')) return null;
  const goodreads = has('exclusive shelf') || (has('isbn13') && has('my rating'));
  const storygraph = has('read status') || has('isbn/uid') || (has('authors') && (has('star rating') || has('last date read')));
  if (goodreads && storygraph) return has('exclusive shelf') || has('isbn13') ? 'goodreads' : 'storygraph';
  if (goodreads) return 'goodreads';
  if (storygraph) return 'storygraph';
  return null;
}

function columnGetter(headers: string[]): (row: string[], name: string) => string {
  const indexes = new Map<string, number>();
  headers.forEach((header, index) => {
    const key = header.trim().toLowerCase();
    if (!indexes.has(key)) indexes.set(key, index);
  });
  return (row, name) => {
    const index = indexes.get(name.toLowerCase());
    if (index === undefined) return '';
    return (row[index] ?? '').trim();
  };
}

function mapStatus(raw: string, bookshelves = ''): BookEntry['status'] {
  const shelf = raw.trim().toLowerCase().replace(/[_\s]+/g, '-');
  const shelves = bookshelves.toLowerCase();
  if (shelf === 'dnf' || shelf === 'did-not-finish' || shelf === 'abandoned' || /\bdnf\b/.test(shelves)) {
    return 'dnf';
  }
  if (shelf === 'read' || shelf === 'finished') return 'read';
  if (shelf === 'currently-reading' || shelf === 'reading') return 'reading';
  return 'to-read';
}

function joinAuthors(primary: string, additional = ''): string {
  const names = [primary.trim(), additional.trim()].filter(Boolean);
  return names.join(', ') || 'Unknown Author';
}

function ratingToken(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating <= 0) return '';
  return String(rating);
}

function buildNotes(parts: { rating: string; review: string; privateNotes: string; tags: string }): string {
  const lines: string[] = [];
  if (parts.rating) lines.push(`Rating: ${parts.rating}`);
  if (parts.review) lines.push(parts.review);
  if (parts.privateNotes && parts.privateNotes !== parts.review) lines.push(parts.privateNotes);
  if (parts.tags) {
    const tags = parts.tags.split(/[|,]/).map((tag) => tag.trim()).filter(Boolean);
    if (tags.length > 0) lines.push(`Tags: ${tags.join(', ')}`);
  }
  return lines.join('\n');
}

function seriesFields(raw: string): { seriesName?: string; seriesIndex?: number } {
  const seriesName = raw.trim();
  if (!seriesName) return {};
  const match = seriesName.match(/#(\d+(?:\.\d+)?)\s*$/);
  const seriesIndex = match ? Number(match[1]) : undefined;
  return {
    seriesName,
    ...(seriesIndex !== undefined && Number.isFinite(seriesIndex) ? { seriesIndex } : {}),
  };
}

function parseDateList(raw: string): { startedAt: string | null; finishedAt: string | null } {
  const parts = raw
    .split(/\s*(?:\||\bto\b|–|—)\s*|\s+-\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
  const startedAt = parts[0] ? parseImportDate(parts[0]) : null;
  const finishedAt = parts[1] ? parseImportDate(parts[1]) : null;
  return { startedAt, finishedAt };
}

/** Shelf names that only repeat the reading status. Custom shelves are kept. */
function shelfTags(raw: string, status: BookEntry['status'], exclusiveShelf: string): string {
  const ignored = new Set(['read', 'to-read', 'currently-reading', 'dnf', status, exclusiveShelf.trim().toLowerCase()]);
  return raw
    .split(/[|,]/)
    .map((tag) => tag.trim())
    .filter((tag) => tag && !ignored.has(tag.toLowerCase()))
    .join(', ');
}

function makeBook(fields: {
  isbn: string;
  title: string;
  author: string;
  pageCount: number;
  status: BookEntry['status'];
  notes: string;
  dateAdded: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  seriesName?: string;
  seriesIndex?: number;
}): BookEntry {
  return {
    id: crypto.randomUUID(),
    isbn: fields.isbn,
    title: fields.title,
    author: fields.author,
    pageCount: fields.pageCount,
    amazonLink: '',
    coverImg: '',
    status: fields.status,
    notes: fields.notes,
    dateAdded: fields.dateAdded,
    startedAt: fields.startedAt ?? null,
    finishedAt: fields.finishedAt ?? null,
    shelfIds: [],
    metadataSource: 'manual',
    ...(fields.seriesName ? { seriesName: fields.seriesName } : {}),
    ...(fields.seriesIndex !== undefined ? { seriesIndex: fields.seriesIndex } : {}),
  };
}

function buildIndex(existing: BookEntry[]): DuplicateIndex {
  const index: DuplicateIndex = { isbns: new Set(), titleAuthors: new Set() };
  for (const book of existing) {
    if (book.isbn && !book.isbn.startsWith('photo-')) rememberIsbn(index, book.isbn);
    if (book.title.trim()) index.titleAuthors.add(titleAuthorKey(book.title, book.author));
  }
  return index;
}

function emptyPreview(format: CatalogFormat): CatalogPreview {
  return {
    format,
    formatLabel: FORMAT_LABEL[format],
    toImport: [],
    duplicateCount: 0,
    problems: [],
    totalRows: 0,
    missingIsbnCount: 0,
  };
}

function prepareCatalogCsv(csv: string): PreparedCatalog | CatalogParseResult {
  const text = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;
  if (text.trim() === '') return { ok: false, error: EMPTY_CATALOG_FILE };
  const lines = splitCSVRows(text);
  if (lines.length === 0) return { ok: false, error: EMPTY_CATALOG_FILE };
  const headers = parseCSVLine(lines[0]).map((header) => header.trim());
  const format = detectCatalogFormat(headers);
  if (!format) return { ok: false, error: UNRECOGNIZED_CATALOG_FILE };
  return { format, headers, rows: lines.slice(1) };
}

function rowToBook(
  format: CatalogFormat,
  row: string[],
  col: (row: string[], name: string) => string,
): { book: BookEntry } | { problem: string } {
  if (row.every((field) => field.trim() === '')) return { problem: 'This row is empty.' };

  if (format === 'goodreads') {
    const title = col(row, 'Title');
    if (!title) return { problem: 'Missing a title.' };
    const isbn = storedIsbn(col(row, 'ISBN13')) || storedIsbn(col(row, 'ISBN'));
    const author = joinAuthors(col(row, 'Author'), col(row, 'Additional Authors'));
    const dateAdded = parseImportDate(col(row, 'Date Added')) ?? new Date().toISOString();
    const finishedAt = parseImportDate(col(row, 'Date Read'));
    const exclusiveShelf = col(row, 'Exclusive Shelf');
    const status = mapStatus(exclusiveShelf, col(row, 'Bookshelves'));
    return {
      book: makeBook({
        isbn,
        title,
        author,
        pageCount: parseInt(col(row, 'Number of Pages'), 10) || 0,
        status,
        notes: buildNotes({
          rating: ratingToken(col(row, 'My Rating')),
          review: col(row, 'My Review'),
          privateNotes: col(row, 'Private Notes'),
          tags: shelfTags(col(row, 'Bookshelves'), status, exclusiveShelf),
        }),
        dateAdded,
        finishedAt,
      }),
    };
  }

  const title = col(row, 'Title');
  if (!title) return { problem: 'Missing a title.' };
  const dates = parseDateList(col(row, 'Dates Read'));
  const lastRead = parseImportDate(col(row, 'Last Date Read'));
  const series = seriesFields(col(row, 'Series'));
  const status = mapStatus(col(row, 'Read Status'));
  return {
    book: makeBook({
      isbn: storedIsbn(col(row, 'ISBN/UID')),
      title,
      author: joinAuthors(col(row, 'Authors') || col(row, 'Author')),
      pageCount: parseInt(col(row, 'Page Count') || col(row, 'Number of Pages'), 10) || 0,
      status,
      notes: buildNotes({
        rating: ratingToken(col(row, 'Star Rating') || col(row, 'My Rating')),
        review: col(row, 'Review') || col(row, 'My Review'),
        privateNotes: '',
        tags: col(row, 'Tags'),
      }),
      dateAdded: parseImportDate(col(row, 'Date Added')) ?? new Date().toISOString(),
      startedAt: dates.startedAt,
      finishedAt: dates.finishedAt ?? (status === 'read' || status === 'dnf' ? lastRead : null),
      ...series,
    }),
  };
}

function consumeRows(
  format: CatalogFormat,
  headers: string[],
  rows: string[],
  startIndex: number,
  index: DuplicateIndex,
  preview: CatalogPreview,
): void {
  const col = columnGetter(headers);
  rows.forEach((line, offset) => {
    const record = startIndex + offset;
    const rowNumber = record + 2;
    let parsed: ReturnType<typeof rowToBook>;
    try {
      parsed = rowToBook(format, parseCSVLine(line), col);
    } catch (error) {
      preview.problems.push({
        row: rowNumber,
        message: error instanceof Error ? error.message : 'This row could not be read.',
      });
      return;
    }
    if ('problem' in parsed) {
      preview.problems.push({ row: rowNumber, message: parsed.problem });
      return;
    }

    const book = parsed.book;
    const authorKey = titleAuthorKey(book.title, book.author);
    if ((book.isbn && isbnIsDuplicate(index, book.isbn)) || index.titleAuthors.has(authorKey)) {
      preview.duplicateCount += 1;
      return;
    }

    preview.toImport.push(book);
    if (!book.isbn) preview.missingIsbnCount += 1;
    if (book.isbn) rememberIsbn(index, book.isbn);
    index.titleAuthors.add(authorKey);
  });
}

function finishPreview(prepared: PreparedCatalog, existing: BookEntry[]): CatalogPreview {
  const preview = emptyPreview(prepared.format);
  preview.totalRows = prepared.rows.length;
  consumeRows(prepared.format, prepared.headers, prepared.rows, 0, buildIndex(existing), preview);
  return preview;
}

export function previewCatalogCsv(csv: string, existing: BookEntry[] = []): CatalogParseResult {
  const prepared = prepareCatalogCsv(csv);
  if ('ok' in prepared) return prepared;
  return { ok: true, preview: finishPreview(prepared, existing) };
}

export async function previewCatalogCsvAsync(
  csv: string,
  existing: BookEntry[] = [],
  onProgress?: (done: number, total: number) => void,
): Promise<CatalogParseResult> {
  const prepared = prepareCatalogCsv(csv);
  if ('ok' in prepared) return prepared;
  const preview = emptyPreview(prepared.format);
  preview.totalRows = prepared.rows.length;
  const index = buildIndex(existing);
  const total = prepared.rows.length;
  if (total === 0) return { ok: true, preview };
  for (let offset = 0; offset < total; offset += CATALOG_PARSE_CHUNK) {
    const slice = prepared.rows.slice(offset, offset + CATALOG_PARSE_CHUNK);
    consumeRows(prepared.format, prepared.headers, slice, offset, index, preview);
    onProgress?.(Math.min(offset + slice.length, total), total);
    if (offset + CATALOG_PARSE_CHUNK < total) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    }
  }
  return { ok: true, preview };
}

export async function importBooksInBatches(
  books: BookEntry[],
  commit: (batch: BookEntry[]) => void,
  onProgress: (done: number, total: number) => void,
  isCancelled: () => boolean,
  batchSize = CATALOG_WRITE_BATCH,
): Promise<number> {
  const size = Math.max(1, batchSize);
  let done = 0;
  for (let offset = 0; offset < books.length; offset += size) {
    if (isCancelled()) break;
    const batch = books.slice(offset, offset + size);
    commit(batch);
    done += batch.length;
    onProgress(done, books.length);
    if (offset + size < books.length) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    }
  }
  return done;
}

export function importFromGoodreadsCSV(
  csvText: string,
  existingBooks: BookEntry[],
): { imported: BookEntry[]; skipped: number } {
  const result = previewCatalogCsv(csvText, existingBooks);
  if (!result.ok || result.preview.format !== 'goodreads') return { imported: [], skipped: 0 };
  return { imported: result.preview.toImport, skipped: result.preview.duplicateCount };
}

export function importFromStoryGraphCSV(
  csv: string,
  existingBooks: BookEntry[],
  addBook: (book: BookEntry) => void,
): ImportResult {
  const result = previewCatalogCsv(csv, existingBooks);
  if (!result.ok || result.preview.format !== 'storygraph') {
    return { added: 0, duplicates: 0, errors: result.ok ? [] : [result.error] };
  }
  for (const book of result.preview.toImport) addBook(book);
  return {
    added: result.preview.toImport.length,
    duplicates: result.preview.duplicateCount,
    errors: result.preview.problems.map((problem) => `Row ${problem.row}: ${problem.message}`),
  };
}
