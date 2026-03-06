import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LibraryList from '../LibraryList';
import { ToastProvider } from '../Toast';
import { useBookStore } from '../../store/useBookStore';
import { useProfileStore } from '../../store/useProfileStore';
import { DEFAULT_PREFERENCES } from '../../types';
import type { BookEntry, Shelf } from '../../types';

/* ================================================================
 *  Mock @tanstack/react-virtual
 * ================================================================
 *
 *  The virtualizer is complex in jsdom. We mock it so list view
 *  renders rows directly without needing real scroll measurements.
 */
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 76,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        start: i * 76,
        size: 76,
        key: i,
      })),
  }),
}));

/* ================================================================
 *  Helpers
 * ================================================================ */

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: crypto.randomUUID(),
  isbn: '9780141036144',
  title: '1984',
  author: 'George Orwell',
  pageCount: 328,
  amazonLink: '',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: '2026-01-15T00:00:00.000Z',
  shelfIds: [],
  ...overrides,
});

const makeShelf = (overrides: Partial<Shelf> = {}): Shelf => ({
  id: 'shelf-1',
  name: 'Fiction',
  color: '#6366f1',
  ...overrides,
});

const renderWithToast = (ui: React.ReactElement) =>
  render(<ToastProvider>{ui}</ToastProvider>);

/* ================================================================
 *  Tests
 * ================================================================ */

describe('LibraryList', () => {
  beforeEach(() => {
    useBookStore.setState({ books: [], shelves: [] });
    useProfileStore.setState({ preferences: { ...DEFAULT_PREFERENCES } });
  });

  /* ── Empty state ─────────────────────────────────────────── */
  describe('empty state', () => {
    it('shows empty library message when no books', () => {
      renderWithToast(<LibraryList />);
      expect(screen.getByText(/Your library is empty/)).toBeInTheDocument();
    });

    it('shows book count of 0', () => {
      renderWithToast(<LibraryList />);
      expect(screen.getByText('Your Library (0)')).toBeInTheDocument();
    });
  });

  /* ── Book display ────────────────────────────────────────── */
  describe('book display', () => {
    it('shows book count in header', () => {
      useBookStore.setState({ books: [makeBook(), makeBook({ id: 'b2', isbn: '0743273567', title: 'Gatsby' })] });
      renderWithToast(<LibraryList />);
      expect(screen.getByText('Your Library (2)')).toBeInTheDocument();
    });

    it('renders books in grid view by default', () => {
      useBookStore.setState({ books: [makeBook()] });
      renderWithToast(<LibraryList />);
      expect(screen.getByText('1984')).toBeInTheDocument();
    });
  });

  /* ── Search ──────────────────────────────────────────────── */
  describe('search', () => {
    it('filters books by title', () => {
      useBookStore.setState({
        books: [
          makeBook({ id: 'b1', title: '1984' }),
          makeBook({ id: 'b2', isbn: '0743273567', title: 'The Great Gatsby', author: 'Fitzgerald' }),
        ],
      });
      renderWithToast(<LibraryList />);

      fireEvent.change(screen.getByLabelText('Search library'), { target: { value: 'Gatsby' } });
      expect(screen.getByText('The Great Gatsby')).toBeInTheDocument();
      expect(screen.queryByText('1984')).not.toBeInTheDocument();
    });

    it('filters books by author', () => {
      useBookStore.setState({
        books: [
          makeBook({ id: 'b1', title: '1984', author: 'Orwell' }),
          makeBook({ id: 'b2', isbn: '0743273567', title: 'Gatsby', author: 'Fitzgerald' }),
        ],
      });
      renderWithToast(<LibraryList />);

      fireEvent.change(screen.getByLabelText('Search library'), { target: { value: 'Fitzgerald' } });
      expect(screen.getByText('Gatsby')).toBeInTheDocument();
      expect(screen.queryByText('1984')).not.toBeInTheDocument();
    });

    it('filters books by ISBN', () => {
      useBookStore.setState({
        books: [
          makeBook({ id: 'b1', isbn: '9780141036144', title: '1984' }),
          makeBook({ id: 'b2', isbn: '0743273567', title: 'Gatsby' }),
        ],
      });
      renderWithToast(<LibraryList />);

      fireEvent.change(screen.getByLabelText('Search library'), { target: { value: '0743273567' } });
      expect(screen.getByText('Gatsby')).toBeInTheDocument();
      expect(screen.queryByText('1984')).not.toBeInTheDocument();
    });

    it('shows no results message when search has no matches', () => {
      useBookStore.setState({ books: [makeBook()] });
      renderWithToast(<LibraryList />);

      fireEvent.change(screen.getByLabelText('Search library'), { target: { value: 'zzz nonexistent' } });
      expect(screen.getByText(/No books match your filters/)).toBeInTheDocument();
    });
  });

  /* ── Status filter ───────────────────────────────────────── */
  describe('status filter', () => {
    it('filters by "Read" status', () => {
      useBookStore.setState({
        books: [
          makeBook({ id: 'b1', title: '1984', status: 'read' }),
          makeBook({ id: 'b2', isbn: '0743273567', title: 'Gatsby', status: 'to-read' }),
        ],
      });
      renderWithToast(<LibraryList />);

      fireEvent.click(screen.getByText('Read'));
      expect(screen.getByText('1984')).toBeInTheDocument();
      expect(screen.queryByText('Gatsby')).not.toBeInTheDocument();
    });

    it('shows all books with "All" filter', () => {
      useBookStore.setState({
        books: [
          makeBook({ id: 'b1', title: '1984', status: 'read' }),
          makeBook({ id: 'b2', isbn: '0743273567', title: 'Gatsby', status: 'to-read' }),
        ],
      });
      renderWithToast(<LibraryList />);

      // All is the default — both should be visible
      expect(screen.getByText('1984')).toBeInTheDocument();
      expect(screen.getByText('Gatsby')).toBeInTheDocument();
    });
  });

  /* ── Sort ────────────────────────────────────────────────── */
  describe('sorting', () => {
    it('sorts by title', () => {
      useBookStore.setState({
        books: [
          makeBook({ id: 'b1', title: 'Zebra', dateAdded: '2026-01-01' }),
          makeBook({ id: 'b2', isbn: '0743273567', title: 'Alpha', dateAdded: '2026-01-02' }),
        ],
      });
      renderWithToast(<LibraryList />);

      fireEvent.click(screen.getByText('Title'));
      const cards = screen.getAllByText(/Zebra|Alpha/);
      // After sorting by title ascending, Alpha should be first
      expect(cards[0].textContent).toBe('Alpha');
    });
  });

  /* ── Shelf filter ────────────────────────────────────────── */
  describe('shelf filter', () => {
    it('shows shelf filter buttons when shelves exist', () => {
      useBookStore.setState({
        shelves: [makeShelf({ id: 's1', name: 'Fiction' })],
        books: [makeBook({ shelfIds: ['s1'] })],
      });
      renderWithToast(<LibraryList />);

      // "All Shelves" button + individual shelf buttons should be present
      expect(screen.getByText('All Shelves')).toBeInTheDocument();
      // Shelf name appears in filter — use getAllByText since it may also appear in cards
      const fictionElements = screen.getAllByText(/Fiction/);
      expect(fictionElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  /* ── View mode ───────────────────────────────────────────── */
  describe('view mode', () => {
    it('has grid and list view toggle buttons', () => {
      useBookStore.setState({ books: [makeBook()] });
      renderWithToast(<LibraryList />);

      expect(screen.getByLabelText('Grid view')).toBeInTheDocument();
      expect(screen.getByLabelText('List view')).toBeInTheDocument();
    });
  });

  /* ── Statistics panel ────────────────────────────────────── */
  describe('statistics', () => {
    it('toggles statistics panel', () => {
      useBookStore.setState({ books: [makeBook({ status: 'read', pageCount: 300 })] });
      renderWithToast(<LibraryList />);

      fireEvent.click(screen.getByLabelText('Toggle reading statistics'));
      expect(screen.getByText('Total Books')).toBeInTheDocument();
      expect(screen.getByText('Pages Read')).toBeInTheDocument();
    });
  });

  /* ── Shelf manager toggle ────────────────────────────────── */
  describe('shelf manager', () => {
    it('toggles shelf manager panel', () => {
      renderWithToast(<LibraryList />);

      fireEvent.click(screen.getByLabelText('Toggle shelf manager'));
      // ShelfManager shows "No shelves yet" when empty
      expect(screen.getByText(/No shelves yet/)).toBeInTheDocument();
    });
  });

  /* ── initialOpenIsbn ─────────────────────────────────────── */
  describe('initialOpenIsbn', () => {
    it('opens book detail when initialOpenIsbn matches a book', () => {
      const book = makeBook({ isbn: '9780141036144', title: '1984' });
      useBookStore.setState({ books: [book] });
      const onOpenComplete = vi.fn();

      renderWithToast(
        <LibraryList initialOpenIsbn="9780141036144" onOpenComplete={onOpenComplete} />
      );

      // BookDetail should be visible with the book info
      expect(screen.getByText(/ISBN: 9780141036144/)).toBeInTheDocument();
      expect(onOpenComplete).toHaveBeenCalled();
    });

    it('calls onOpenComplete even if ISBN not found', () => {
      useBookStore.setState({ books: [] });
      const onOpenComplete = vi.fn();

      renderWithToast(
        <LibraryList initialOpenIsbn="0000000000" onOpenComplete={onOpenComplete} />
      );

      expect(onOpenComplete).toHaveBeenCalled();
    });
  });

  /* ── Manage data ─────────────────────────────────────────── */
  describe('manage data', () => {
    it('calls onManageData when settings button is clicked', () => {
      const onManageData = vi.fn();
      renderWithToast(<LibraryList onManageData={onManageData} />);

      fireEvent.click(screen.getByLabelText('Manage library data'));
      expect(onManageData).toHaveBeenCalledOnce();
    });
  });
});
