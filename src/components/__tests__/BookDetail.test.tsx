import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import BookDetail from '../BookDetail';
import { ToastProvider } from '../Toast';
import { useBookStore } from '../../store/useBookStore';
import type { BookEntry, Shelf } from '../../types';

/* ================================================================
 *  Helpers
 * ================================================================ */

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'detail-1',
  isbn: '9780141036144',
  title: '1984',
  author: 'George Orwell',
  pageCount: 328,
  amazonLink: 'https://amazon.com/s?k=9780141036144',
  coverImg: 'https://example.com/cover.jpg',
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

describe('BookDetail', () => {
  beforeEach(() => {
    useBookStore.setState({ books: [], shelves: [] });
  });

  /* ── Display ─────────────────────────────────────────────── */
  describe('display', () => {
    it('shows book title and author', () => {
      const book = makeBook();
      useBookStore.setState({ books: [book] });
      renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

      expect(screen.getByText('1984')).toBeInTheDocument();
      expect(screen.getByText('George Orwell')).toBeInTheDocument();
    });

    it('shows ISBN and page count', () => {
      const book = makeBook();
      useBookStore.setState({ books: [book] });
      renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

      expect(screen.getByText(/ISBN: 9780141036144/)).toBeInTheDocument();
      expect(screen.getByText(/328 pages/)).toBeInTheDocument();
    });

    it('shows dateAdded', () => {
      const book = makeBook();
      useBookStore.setState({ books: [book] });
      renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

      expect(screen.getByText(/Added/)).toBeInTheDocument();
    });

    it('shows Amazon link', () => {
      const book = makeBook();
      useBookStore.setState({ books: [book] });
      renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

      expect(screen.getByText(/View on Amazon/)).toBeInTheDocument();
    });

    it('hides page count when 0', () => {
      const book = makeBook({ pageCount: 0 });
      useBookStore.setState({ books: [book] });
      renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

      expect(screen.queryByText(/pages/)).not.toBeInTheDocument();
    });
  });

  /* ── Close ───────────────────────────────────────────────── */
  describe('close', () => {
    it('calls onClose when X button is clicked', () => {
      const book = makeBook();
      const onClose = vi.fn();
      useBookStore.setState({ books: [book] });
      renderWithToast(<BookDetail book={book} onClose={onClose} />);

      fireEvent.click(screen.getByLabelText('Close detail view'));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when overlay is clicked', () => {
      const book = makeBook();
      const onClose = vi.fn();
      useBookStore.setState({ books: [book] });
      const { container } = renderWithToast(<BookDetail book={book} onClose={onClose} />);

      // The overlay is the outermost div of BookDetail
      const overlay = container.querySelector('[class*="overlay"]');
      if (overlay) fireEvent.click(overlay);
      expect(onClose).toHaveBeenCalled();
    });

    it('calls onClose when Escape is pressed (not editing)', () => {
      const book = makeBook();
      const onClose = vi.fn();
      useBookStore.setState({ books: [book] });
      const { container } = renderWithToast(<BookDetail book={book} onClose={onClose} />);

      const modal = container.querySelector('[class*="modal"]');
      if (modal) fireEvent.keyDown(modal, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });
  });

  /* ── Editing ─────────────────────────────────────────────── */
  describe('editing', () => {
    it('shows edit form when Edit Details is clicked', () => {
      const book = makeBook();
      useBookStore.setState({ books: [book] });
      renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

      fireEvent.click(screen.getByText(/Edit Details/));
      // Should show Save and Cancel buttons
      expect(screen.getByText(/Save/)).toBeInTheDocument();
      expect(screen.getByText(/Cancel/)).toBeInTheDocument();
    });

    it('populates form with current values', () => {
      const book = makeBook();
      useBookStore.setState({ books: [book] });
      renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

      fireEvent.click(screen.getByText(/Edit Details/));
      expect(screen.getByDisplayValue('1984')).toBeInTheDocument();
      expect(screen.getByDisplayValue('George Orwell')).toBeInTheDocument();
      expect(screen.getByDisplayValue('9780141036144')).toBeInTheDocument();
    });

    it('saves edited title', () => {
      const book = makeBook();
      useBookStore.setState({ books: [book] });
      renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

      fireEvent.click(screen.getByText(/Edit Details/));
      const titleInput = screen.getByDisplayValue('1984');
      fireEvent.change(titleInput, { target: { value: 'Nineteen Eighty-Four' } });
      fireEvent.click(screen.getByText(/Save/));

      const updated = useBookStore.getState().books[0];
      expect(updated.title).toBe('Nineteen Eighty-Four');
    });

    it('cancels editing without saving changes', () => {
      const book = makeBook();
      useBookStore.setState({ books: [book] });
      renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

      fireEvent.click(screen.getByText(/Edit Details/));
      const titleInput = screen.getByDisplayValue('1984');
      fireEvent.change(titleInput, { target: { value: 'Changed' } });
      fireEvent.click(screen.getByText(/Cancel/));

      expect(useBookStore.getState().books[0].title).toBe('1984');
      expect(screen.getByText('1984')).toBeInTheDocument();
    });

    it('saves on Enter key', () => {
      const book = makeBook();
      useBookStore.setState({ books: [book] });
      const { container } = renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

      fireEvent.click(screen.getByText(/Edit Details/));
      const titleInput = screen.getByDisplayValue('1984');
      fireEvent.change(titleInput, { target: { value: 'New Title' } });

      const modal = container.querySelector('[class*="modal"]');
      if (modal) fireEvent.keyDown(modal, { key: 'Enter' });

      expect(useBookStore.getState().books[0].title).toBe('New Title');
    });
  });

  /* ── Status ──────────────────────────────────────────────── */
  describe('status', () => {
    it('renders all four status buttons', () => {
      const book = makeBook();
      useBookStore.setState({ books: [book] });
      renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

      expect(screen.getByLabelText('Set status to To Read')).toBeInTheDocument();
      expect(screen.getByLabelText('Set status to Reading')).toBeInTheDocument();
      expect(screen.getByLabelText('Set status to Read')).toBeInTheDocument();
      expect(screen.getByLabelText('Set status to Did Not Finish')).toBeInTheDocument();
    });

    it('updates status when button is clicked', () => {
      const book = makeBook({ status: 'to-read' });
      useBookStore.setState({ books: [book] });
      renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

      fireEvent.click(screen.getByLabelText('Set status to Read'));
      expect(useBookStore.getState().books[0].status).toBe('read');
    });

    it('updates progress from the quick action buttons', () => {
      const book = makeBook({ status: 'to-read', pagesFinished: 0 });
      useBookStore.setState({ books: [book] });
      renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

      fireEvent.click(screen.getByText('+25 pages'));
      const updated = useBookStore.getState().books[0];
      expect(updated.pagesFinished).toBe(25);
      expect(updated.status).toBe('reading');
    });
  });

  /* ── Shelves ─────────────────────────────────────────────── */
  describe('shelves', () => {
    it('displays shelf chips for assigned shelves', () => {
      const shelf = makeShelf({ id: 's1', name: 'Favorites' });
      const book = makeBook({ shelfIds: ['s1'] });
      useBookStore.setState({ books: [book], shelves: [shelf] });
      renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

      expect(screen.getByText('Favorites')).toBeInTheDocument();
    });

    it('shows shelf picker when "+ Shelf" is clicked', () => {
      const shelf1 = makeShelf({ id: 's1', name: 'Favorites' });
      const shelf2 = makeShelf({ id: 's2', name: 'Sci-Fi', color: '#22c55e' });
      const book = makeBook({ shelfIds: [] });
      useBookStore.setState({ books: [book], shelves: [shelf1, shelf2] });
      renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

      fireEvent.click(screen.getByLabelText('Add to shelf'));
      expect(screen.getByText('Favorites')).toBeInTheDocument();
      expect(screen.getByText('Sci-Fi')).toBeInTheDocument();
    });

    it('assigns a shelf when selected from picker', () => {
      const shelf = makeShelf({ id: 's1', name: 'History' });
      const book = makeBook({ shelfIds: [] });
      useBookStore.setState({ books: [book], shelves: [shelf] });
      renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

      fireEvent.click(screen.getByLabelText('Add to shelf'));
      fireEvent.click(screen.getByText('History'));

      expect(useBookStore.getState().books[0].shelfIds).toContain('s1');
    });
  });

  /* ── Notes ───────────────────────────────────────────────── */
  describe('notes', () => {
    it('shows notes textarea', () => {
      const book = makeBook({ notes: 'Great dystopian novel' });
      useBookStore.setState({ books: [book] });
      renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

      const textarea = screen.getByPlaceholderText(/Add your notes/);
      expect(textarea).toHaveValue('Great dystopian novel');
    });

    it('updates notes on change', () => {
      const book = makeBook();
      useBookStore.setState({ books: [book] });
      renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

      const textarea = screen.getByPlaceholderText(/Add your notes/);
      fireEvent.change(textarea, { target: { value: 'New note' } });

      expect(useBookStore.getState().books[0].notes).toBe('New note');
    });
  });

  /* ── Remove ──────────────────────────────────────────────── */
  describe('remove', () => {
    it('shows confirm dialog when Remove is clicked', async () => {
      const book = makeBook();
      useBookStore.setState({ books: [book] });
      renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

      await act(async () => {
        fireEvent.click(screen.getByText(/Remove/));
      });

      expect(screen.getByText('Remove Book')).toBeInTheDocument();
      expect(screen.getByText(/Remove "1984" from your library/)).toBeInTheDocument();
    });

    it('removes book and calls onClose when confirmed', async () => {
      const book = makeBook();
      const onClose = vi.fn();
      useBookStore.setState({ books: [book] });
      renderWithToast(<BookDetail book={book} onClose={onClose} />);

      await act(async () => {
        fireEvent.click(screen.getByText(/Remove/));
      });

      // Click the confirm "Remove" button in the dialog
      const removeButtons = screen.getAllByText('Remove');
      await act(async () => {
        fireEvent.click(removeButtons[removeButtons.length - 1]);
      });

      expect(useBookStore.getState().books).toHaveLength(0);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
