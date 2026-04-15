import { describe, it, expect, beforeEach } from 'vitest';
import { useBookStore } from '../useBookStore';
import type { BookEntry } from '../../types';
import type { Shelf } from '../../types';

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'test-1',
  isbn: '9780141036144',
  title: 'Test Book',
  author: 'Test Author',
  pageCount: 200,
  amazonLink: 'https://amazon.com',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: new Date().toISOString(),
  shelfIds: [],
  ...overrides,
});

const makeShelf = (overrides: Partial<Shelf> = {}): Shelf => ({
  id: 'shelf-1',
  name: 'Fiction',
  color: '#6366f1',
  ...overrides,
});

describe('useBookStore', () => {
  beforeEach(() => {
    // Reset store state between tests
    useBookStore.setState({ books: [], shelves: [] });
  });

  it('starts with empty books array', () => {
    expect(useBookStore.getState().books).toEqual([]);
  });

  it('adds a book', () => {
    const book = makeBook();
    useBookStore.getState().addBook(book);
    expect(useBookStore.getState().books).toHaveLength(1);
    expect(useBookStore.getState().books[0].title).toBe('Test Book');
  });

  it('prepends new books (most recent first)', () => {
    useBookStore.getState().addBook(makeBook({ id: '1', title: 'First' }));
    useBookStore.getState().addBook(makeBook({ id: '2', title: 'Second' }));
    expect(useBookStore.getState().books[0].title).toBe('Second');
    expect(useBookStore.getState().books[1].title).toBe('First');
  });

  it('removes a book by id', () => {
    useBookStore.getState().addBook(makeBook({ id: '1' }));
    useBookStore.getState().addBook(makeBook({ id: '2' }));
    useBookStore.getState().removeBook('1');
    expect(useBookStore.getState().books).toHaveLength(1);
    expect(useBookStore.getState().books[0].id).toBe('2');
  });

  it('updates book status', () => {
    useBookStore.getState().addBook(makeBook({ id: '1', status: 'to-read' }));
    useBookStore.getState().updateBookStatus('1', 'reading');
    expect(useBookStore.getState().books[0].status).toBe('reading');
  });

  it('updates book notes', () => {
    useBookStore.getState().addBook(makeBook({ id: '1', notes: '' }));
    useBookStore.getState().updateBookNotes('1', 'Great book!');
    expect(useBookStore.getState().books[0].notes).toBe('Great book!');
  });

  it('updates reading progress and moves a book into reading', () => {
    useBookStore.getState().addBook(makeBook({ id: '1', status: 'to-read', pagesFinished: 0 }));
    useBookStore.getState().updateReadingProgress('1', 25);
    const book = useBookStore.getState().books[0];
    expect(book.pagesFinished).toBe(25);
    expect(book.status).toBe('reading');
  });

  it('can explicitly resolve a review flag', () => {
    useBookStore.getState().addBook(makeBook({ id: '1', needsReview: true, reviewReason: 'Missing metadata' }));
    useBookStore.getState().markNeedsReview('1', false);
    const book = useBookStore.getState().books[0];
    expect(book.needsReview).toBe(false);
    expect(book.reviewReason).toBe('');
  });

  it('does not affect other books when updating', () => {
    useBookStore.getState().addBook(makeBook({ id: '1', title: 'Book 1' }));
    useBookStore.getState().addBook(makeBook({ id: '2', title: 'Book 2' }));
    useBookStore.getState().updateBookStatus('1', 'read');
    expect(useBookStore.getState().books.find(b => b.id === '2')?.status).toBe('to-read');
  });

  // ─── updateBook (generic partial update) ─────────────────────
  it('updates a book with partial fields', () => {
    useBookStore.getState().addBook(makeBook({ id: '1', title: 'Old Title', author: 'Old Author' }));
    useBookStore.getState().updateBook('1', { title: 'New Title', pageCount: 999 });
    const book = useBookStore.getState().books[0];
    expect(book.title).toBe('New Title');
    expect(book.pageCount).toBe(999);
    expect(book.author).toBe('Old Author'); // unchanged
  });

  it('updateBook does not affect other books', () => {
    useBookStore.getState().addBook(makeBook({ id: '1', title: 'Book 1' }));
    useBookStore.getState().addBook(makeBook({ id: '2', title: 'Book 2' }));
    useBookStore.getState().updateBook('1', { title: 'Updated' });
    expect(useBookStore.getState().books.find(b => b.id === '2')?.title).toBe('Book 2');
  });

  // ─── setBooks (bulk replace) ──────────────────────────────────
  it('setBooks replaces the entire books array', () => {
    useBookStore.getState().addBook(makeBook({ id: '1' }));
    useBookStore.getState().addBook(makeBook({ id: '2' }));
    const replacement = [makeBook({ id: '3', title: 'Replacement' })];
    useBookStore.getState().setBooks(replacement);
    expect(useBookStore.getState().books).toHaveLength(1);
    expect(useBookStore.getState().books[0].id).toBe('3');
  });

  // ─── Shelf CRUD ───────────────────────────────────────────────
  it('starts with empty shelves array', () => {
    expect(useBookStore.getState().shelves).toEqual([]);
  });

  it('adds a shelf', () => {
    useBookStore.getState().addShelf(makeShelf());
    expect(useBookStore.getState().shelves).toHaveLength(1);
    expect(useBookStore.getState().shelves[0].name).toBe('Fiction');
  });

  it('updates a shelf', () => {
    useBookStore.getState().addShelf(makeShelf({ id: 's1', name: 'Old Name' }));
    useBookStore.getState().updateShelf('s1', { name: 'New Name' });
    expect(useBookStore.getState().shelves[0].name).toBe('New Name');
  });

  it('removes a shelf', () => {
    useBookStore.getState().addShelf(makeShelf({ id: 's1' }));
    useBookStore.getState().addShelf(makeShelf({ id: 's2', name: 'Other' }));
    useBookStore.getState().removeShelf('s1');
    expect(useBookStore.getState().shelves).toHaveLength(1);
    expect(useBookStore.getState().shelves[0].id).toBe('s2');
  });

  it('removing a shelf also unassigns it from all books', () => {
    useBookStore.getState().addShelf(makeShelf({ id: 's1' }));
    useBookStore.getState().addBook(makeBook({ id: 'b1', shelfIds: ['s1', 's2'] }));
    useBookStore.getState().addBook(makeBook({ id: 'b2', shelfIds: ['s1'] }));
    useBookStore.getState().removeShelf('s1');
    expect(useBookStore.getState().books.find(b => b.id === 'b1')?.shelfIds).toEqual(['s2']);
    expect(useBookStore.getState().books.find(b => b.id === 'b2')?.shelfIds).toEqual([]);
  });

  it('setShelves replaces the entire shelves array', () => {
    useBookStore.getState().addShelf(makeShelf({ id: 's1' }));
    const replacement = [makeShelf({ id: 's2', name: 'New Shelf' })];
    useBookStore.getState().setShelves(replacement);
    expect(useBookStore.getState().shelves).toHaveLength(1);
    expect(useBookStore.getState().shelves[0].id).toBe('s2');
  });

  // ─── Shelf assignment ─────────────────────────────────────────
  it('assigns a shelf to a book', () => {
    useBookStore.getState().addBook(makeBook({ id: 'b1', shelfIds: [] }));
    useBookStore.getState().assignShelf('b1', 's1');
    expect(useBookStore.getState().books[0].shelfIds).toEqual(['s1']);
  });

  it('does not double-assign the same shelf', () => {
    useBookStore.getState().addBook(makeBook({ id: 'b1', shelfIds: ['s1'] }));
    useBookStore.getState().assignShelf('b1', 's1');
    expect(useBookStore.getState().books[0].shelfIds).toEqual(['s1']);
  });

  it('unassigns a shelf from a book', () => {
    useBookStore.getState().addBook(makeBook({ id: 'b1', shelfIds: ['s1', 's2'] }));
    useBookStore.getState().unassignShelf('b1', 's1');
    expect(useBookStore.getState().books[0].shelfIds).toEqual(['s2']);
  });

  it('unassigning a non-existent shelf is a no-op', () => {
    useBookStore.getState().addBook(makeBook({ id: 'b1', shelfIds: ['s1'] }));
    useBookStore.getState().unassignShelf('b1', 'nonexistent');
    expect(useBookStore.getState().books[0].shelfIds).toEqual(['s1']);
  });

  // ─── markNeedsReview (additional branches) ───────────────────
  it('markNeedsReview with reason sets reviewReason', () => {
    useBookStore.getState().addBook(makeBook({ id: '1' }));
    useBookStore.getState().markNeedsReview('1', true, 'Poor scan quality');
    const book = useBookStore.getState().books[0];
    expect(book.needsReview).toBe(true);
    expect(book.reviewReason).toBe('Poor scan quality');
  });

  it('markNeedsReview without reason uses existing reviewReason', () => {
    useBookStore.getState().addBook(makeBook({ id: '1', reviewReason: 'Existing reason' }));
    useBookStore.getState().markNeedsReview('1', true);
    const book = useBookStore.getState().books[0];
    expect(book.needsReview).toBe(true);
    expect(book.reviewReason).toBe('Existing reason');
  });

  it('markNeedsReview false clears reviewReason even with reason argument', () => {
    useBookStore.getState().addBook(makeBook({ id: '1', needsReview: true, reviewReason: 'Something' }));
    useBookStore.getState().markNeedsReview('1', false, 'Ignored');
    const book = useBookStore.getState().books[0];
    expect(book.needsReview).toBe(false);
    expect(book.reviewReason).toBe('');
  });

  // ─── Bulk operations ──────────────────────────────────────────
  it('bulkUpdateBooks updates only books with matching IDs', () => {
    useBookStore.getState().addBook(makeBook({ id: 'b1', status: 'to-read' }));
    useBookStore.getState().addBook(makeBook({ id: 'b2', status: 'to-read' }));
    useBookStore.getState().addBook(makeBook({ id: 'b3', status: 'to-read' }));
    useBookStore.getState().bulkUpdateBooks(['b1', 'b3'], { notes: 'Bulk note' });
    const books = useBookStore.getState().books;
    expect(books.find(b => b.id === 'b1')?.notes).toBe('Bulk note');
    expect(books.find(b => b.id === 'b2')?.notes).toBe(''); // unchanged
    expect(books.find(b => b.id === 'b3')?.notes).toBe('Bulk note');
  });

  it('bulkUpdateStatus updates only matching books', () => {
    useBookStore.getState().addBook(makeBook({ id: 'b1', status: 'to-read' }));
    useBookStore.getState().addBook(makeBook({ id: 'b2', status: 'to-read' }));
    useBookStore.getState().bulkUpdateStatus(['b1'], 'read');
    const books = useBookStore.getState().books;
    expect(books.find(b => b.id === 'b1')?.status).toBe('read');
    expect(books.find(b => b.id === 'b2')?.status).toBe('to-read');
  });

  it('bulkAssignShelf adds shelf to matching books that do not already have it', () => {
    useBookStore.getState().addBook(makeBook({ id: 'b1', shelfIds: [] }));
    useBookStore.getState().addBook(makeBook({ id: 'b2', shelfIds: ['s1'] })); // already has it
    useBookStore.getState().addBook(makeBook({ id: 'b3', shelfIds: [] })); // not in IDs
    useBookStore.getState().bulkAssignShelf(['b1', 'b2'], 's1');
    const books = useBookStore.getState().books;
    expect(books.find(b => b.id === 'b1')?.shelfIds).toContain('s1');
    expect(books.find(b => b.id === 'b2')?.shelfIds).toEqual(['s1']); // not duplicated
    expect(books.find(b => b.id === 'b3')?.shelfIds).toEqual([]); // not in IDs
  });

  it('bulkUnassignShelf removes shelf only from matching books', () => {
    useBookStore.getState().addBook(makeBook({ id: 'b1', shelfIds: ['s1', 's2'] }));
    useBookStore.getState().addBook(makeBook({ id: 'b2', shelfIds: ['s1'] })); // not in IDs
    useBookStore.getState().bulkUnassignShelf(['b1'], 's1');
    const books = useBookStore.getState().books;
    expect(books.find(b => b.id === 'b1')?.shelfIds).toEqual(['s2']);
    expect(books.find(b => b.id === 'b2')?.shelfIds).toEqual(['s1']); // unchanged
  });

  it('bulkRemoveBooks removes all specified books', () => {
    useBookStore.getState().addBook(makeBook({ id: 'b1' }));
    useBookStore.getState().addBook(makeBook({ id: 'b2' }));
    useBookStore.getState().addBook(makeBook({ id: 'b3' }));
    useBookStore.getState().bulkRemoveBooks(['b1', 'b3']);
    expect(useBookStore.getState().books).toHaveLength(1);
    expect(useBookStore.getState().books[0].id).toBe('b2');
  });

  it('bulkRemoveBooks with empty ids is a no-op', () => {
    useBookStore.getState().addBook(makeBook({ id: 'b1' }));
    useBookStore.getState().bulkRemoveBooks([]);
    expect(useBookStore.getState().books).toHaveLength(1);
  });

  // ─── mergeBooks ───────────────────────────────────────────────
  it('mergeBooks is a no-op when keepId does not exist', () => {
    useBookStore.getState().addBook(makeBook({ id: 'b1', title: 'Book 1' }));
    useBookStore.getState().mergeBooks('nonexistent', ['b1']);
    expect(useBookStore.getState().books).toHaveLength(1);
    expect(useBookStore.getState().books[0].id).toBe('b1');
  });

  it('mergeBooks keeps the best title and removes duplicates', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep', title: 'Short' }));
    useBookStore.getState().addBook(makeBook({ id: 'drop', title: 'A Much Longer Title' }));
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books).toHaveLength(1);
    expect(useBookStore.getState().books[0].title).toBe('A Much Longer Title');
  });

  it('mergeBooks keeps the keep book title when it is longer', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep', title: 'This is the longer title' }));
    useBookStore.getState().addBook(makeBook({ id: 'drop', title: 'Short' }));
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books[0].title).toBe('This is the longer title');
  });

  it('mergeBooks uses other title when keep title is Unknown Title', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep', title: 'Unknown Title' }));
    useBookStore.getState().addBook(makeBook({ id: 'drop', title: 'Real Title' }));
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books[0].title).toBe('Real Title');
  });

  it('mergeBooks uses keep title when other title is Unknown Title', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep', title: 'Real Title' }));
    useBookStore.getState().addBook(makeBook({ id: 'drop', title: 'Unknown Title' }));
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books[0].title).toBe('Real Title');
  });

  it('mergeBooks uses other title when keep title is review isbn entry', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep', title: 'Review isbn entry' }));
    useBookStore.getState().addBook(makeBook({ id: 'drop', title: 'Real Title' }));
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books[0].title).toBe('Real Title');
  });

  it('mergeBooks handles empty title in drop book', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep', title: 'Keep Title' }));
    useBookStore.getState().addBook(makeBook({ id: 'drop', title: '' }));
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books[0].title).toBe('Keep Title');
  });

  it('mergeBooks handles empty title in keep book', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep', title: '' }));
    useBookStore.getState().addBook(makeBook({ id: 'drop', title: 'Drop Title' }));
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books[0].title).toBe('Drop Title');
  });

  it('mergeBooks uses best author (Unknown Author → other)', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep', author: 'Unknown Author' }));
    useBookStore.getState().addBook(makeBook({ id: 'drop', author: 'Real Author' }));
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books[0].author).toBe('Real Author');
  });

  it('mergeBooks keeps keep author when drop author is Unknown Author', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep', author: 'Real Author' }));
    useBookStore.getState().addBook(makeBook({ id: 'drop', author: 'Unknown Author' }));
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books[0].author).toBe('Real Author');
  });

  it('mergeBooks uses other author when keep author is manual entry', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep', author: 'Manual entry' }));
    useBookStore.getState().addBook(makeBook({ id: 'drop', author: 'Real Author' }));
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books[0].author).toBe('Real Author');
  });

  it('mergeBooks handles empty author in keep', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep', author: '' }));
    useBookStore.getState().addBook(makeBook({ id: 'drop', author: 'Author Name' }));
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books[0].author).toBe('Author Name');
  });

  it('mergeBooks handles empty author in drop', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep', author: 'Author Name' }));
    useBookStore.getState().addBook(makeBook({ id: 'drop', author: '' }));
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books[0].author).toBe('Author Name');
  });

  it('mergeBooks uses max pageCount from either book', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep', pageCount: 100 }));
    useBookStore.getState().addBook(makeBook({ id: 'drop', pageCount: 350 }));
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books[0].pageCount).toBe(350);
  });

  it('mergeBooks merges shelfIds without duplicates', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep', shelfIds: ['s1', 's2'] }));
    useBookStore.getState().addBook(makeBook({ id: 'drop', shelfIds: ['s2', 's3'] }));
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books[0].shelfIds).toEqual(['s1', 's2', 's3']);
  });

  it('mergeBooks concatenates non-empty notes', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep', notes: 'Keep note' }));
    useBookStore.getState().addBook(makeBook({ id: 'drop', notes: 'Drop note' }));
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books[0].notes).toContain('Keep note');
    expect(useBookStore.getState().books[0].notes).toContain('Drop note');
  });

  it('mergeBooks skips empty notes in concatenation', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep', notes: '' }));
    useBookStore.getState().addBook(makeBook({ id: 'drop', notes: 'Drop note' }));
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books[0].notes).toBe('Drop note');
  });

  it('mergeBooks ignores removeIds that equal keepId', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep', title: 'Keep' }));
    useBookStore.getState().addBook(makeBook({ id: 'other', title: 'Other' }));
    // keepId in removeIds should be filtered out
    useBookStore.getState().mergeBooks('keep', ['keep', 'other']);
    expect(useBookStore.getState().books).toHaveLength(1);
    expect(useBookStore.getState().books[0].id).toBe('keep');
  });

  it('mergeBooks uses keep coverImg when non-empty', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep', coverImg: 'https://keep.jpg' }));
    useBookStore.getState().addBook(makeBook({ id: 'drop', coverImg: 'https://drop.jpg' }));
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books[0].coverImg).toBe('https://keep.jpg');
  });

  it('mergeBooks falls back to drop coverImg when keep is empty', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep', coverImg: '' }));
    useBookStore.getState().addBook(makeBook({ id: 'drop', coverImg: 'https://drop.jpg' }));
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books[0].coverImg).toBe('https://drop.jpg');
  });

  it('mergeBooks uses keep amazonLink when non-empty', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep', amazonLink: 'https://keep-link' }));
    useBookStore.getState().addBook(makeBook({ id: 'drop', amazonLink: 'https://drop-link' }));
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books[0].amazonLink).toBe('https://keep-link');
  });

  it('mergeBooks falls back to drop amazonLink when keep is empty', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep', amazonLink: '' }));
    useBookStore.getState().addBook(makeBook({ id: 'drop', amazonLink: 'https://drop-link' }));
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books[0].amazonLink).toBe('https://drop-link');
  });

  it('mergeBooks keeps seriesName from keep when present', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep', seriesName: 'Harry Potter' }));
    useBookStore.getState().addBook(makeBook({ id: 'drop', seriesName: 'Other Series' }));
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books[0].seriesName).toBe('Harry Potter');
  });

  it('mergeBooks uses drop seriesName when keep seriesName is empty', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep', seriesName: '' }));
    useBookStore.getState().addBook(makeBook({ id: 'drop', seriesName: 'Drop Series' }));
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books[0].seriesName).toBe('Drop Series');
  });

  it('mergeBooks keeps seriesIndex from keep when present', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep', seriesIndex: 1 }));
    useBookStore.getState().addBook(makeBook({ id: 'drop', seriesIndex: 2 }));
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books[0].seriesIndex).toBe(1);
  });

  it('mergeBooks uses drop seriesIndex when keep seriesIndex is nullish', () => {
    useBookStore.getState().addBook(makeBook({ id: 'keep' })); // no seriesIndex
    useBookStore.getState().addBook(makeBook({ id: 'drop', seriesIndex: 3 }));
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books[0].seriesIndex).toBe(3);
  });

  it('mergeBooks handles null/undefined shelfIds and highlights gracefully', () => {
    // Books with missing optional arrays
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const keepBook = makeBook({ id: 'keep', shelfIds: undefined as any, notes: undefined as any });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dropBook = makeBook({ id: 'drop', shelfIds: undefined as any, highlights: undefined as any });
    useBookStore.getState().addBook(keepBook);
    useBookStore.getState().addBook(dropBook);
    useBookStore.getState().mergeBooks('keep', ['drop']);
    const merged = useBookStore.getState().books[0];
    expect(Array.isArray(merged.shelfIds)).toBe(true);
  });

  it('mergeBooks handles null pageCount correctly', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const keepBook = makeBook({ id: 'keep', pageCount: 0 as any });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dropBook = makeBook({ id: 'drop', pageCount: null as any });
    useBookStore.getState().addBook(keepBook);
    useBookStore.getState().addBook(dropBook);
    useBookStore.getState().mergeBooks('keep', ['drop']);
    expect(useBookStore.getState().books[0].pageCount).toBe(0);
  });
});
