import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ShelfManager from '../ShelfManager';
import { ToastProvider } from '../Toast';
import { useBookStore } from '../../store/useBookStore';
import type { Shelf } from '../../types';

/* ================================================================
 *  Helpers
 * ================================================================ */

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

describe('ShelfManager', () => {
  beforeEach(() => {
    useBookStore.setState({ books: [], shelves: [] });
  });

  /* ── Empty state ─────────────────────────────────────────── */
  describe('empty state', () => {
    it('shows empty message when no shelves exist', () => {
      renderWithToast(<ShelfManager />);
      expect(screen.getByText(/No shelves yet/)).toBeInTheDocument();
    });

    it('shows "New Shelf" button', () => {
      renderWithToast(<ShelfManager />);
      expect(screen.getByLabelText('Create new shelf')).toBeInTheDocument();
    });
  });

  /* ── Create shelf ────────────────────────────────────────── */
  describe('create shelf', () => {
    it('opens create form when "New Shelf" is clicked', () => {
      renderWithToast(<ShelfManager />);
      fireEvent.click(screen.getByLabelText('Create new shelf'));
      expect(screen.getByPlaceholderText('Shelf name...')).toBeInTheDocument();
    });

    it('creates a shelf with the entered name', () => {
      renderWithToast(<ShelfManager />);

      fireEvent.click(screen.getByLabelText('Create new shelf'));
      fireEvent.change(screen.getByPlaceholderText('Shelf name...'), { target: { value: 'My Shelf' } });
      fireEvent.click(screen.getByText('Add'));

      const shelves = useBookStore.getState().shelves;
      expect(shelves).toHaveLength(1);
      expect(shelves[0].name).toBe('My Shelf');
    });

    it('creates shelf on Enter key', () => {
      renderWithToast(<ShelfManager />);

      fireEvent.click(screen.getByLabelText('Create new shelf'));
      const input = screen.getByPlaceholderText('Shelf name...');
      fireEvent.change(input, { target: { value: 'Enter Shelf' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(useBookStore.getState().shelves[0].name).toBe('Enter Shelf');
    });

    it('does not create shelf with empty name', () => {
      renderWithToast(<ShelfManager />);

      fireEvent.click(screen.getByLabelText('Create new shelf'));
      fireEvent.click(screen.getByText('Add'));

      expect(useBookStore.getState().shelves).toHaveLength(0);
    });

    it('does not create shelf with whitespace-only name', () => {
      renderWithToast(<ShelfManager />);

      fireEvent.click(screen.getByLabelText('Create new shelf'));
      fireEvent.change(screen.getByPlaceholderText('Shelf name...'), { target: { value: '   ' } });
      fireEvent.click(screen.getByText('Add'));

      expect(useBookStore.getState().shelves).toHaveLength(0);
    });

    it('prevents duplicate shelf names (case insensitive)', () => {
      useBookStore.setState({ shelves: [makeShelf({ name: 'Fiction' })] });
      renderWithToast(<ShelfManager />);

      fireEvent.click(screen.getByLabelText('Create new shelf'));
      fireEvent.change(screen.getByPlaceholderText('Shelf name...'), { target: { value: 'fiction' } });
      fireEvent.click(screen.getByText('Add'));

      // Should still have only 1 shelf
      expect(useBookStore.getState().shelves).toHaveLength(1);
    });

    it('closes create form when cancel is clicked', () => {
      renderWithToast(<ShelfManager />);

      fireEvent.click(screen.getByLabelText('Create new shelf'));
      expect(screen.getByPlaceholderText('Shelf name...')).toBeInTheDocument();

      // Click the X cancel button
      const cancelBtns = screen.getAllByRole('button');
      const cancelBtn = cancelBtns.find(btn => btn.querySelector('svg') && btn.textContent === '');
      if (cancelBtn) fireEvent.click(cancelBtn);
    });
  });

  /* ── Display shelves ─────────────────────────────────────── */
  describe('display', () => {
    it('renders existing shelves', () => {
      useBookStore.setState({
        shelves: [
          makeShelf({ id: 's1', name: 'Fiction' }),
          makeShelf({ id: 's2', name: 'Non-Fiction', color: '#22c55e' }),
        ],
      });
      renderWithToast(<ShelfManager />);

      expect(screen.getByText('Fiction')).toBeInTheDocument();
      expect(screen.getByText('Non-Fiction')).toBeInTheDocument();
    });

    it('shows book count for each shelf', () => {
      const shelf = makeShelf({ id: 's1', name: 'Fiction' });
      useBookStore.setState({
        shelves: [shelf],
        books: [
          { id: 'b1', isbn: '111', title: 'A', author: 'A', pageCount: 0, amazonLink: '', coverImg: '', status: 'read' as const, notes: '', dateAdded: '', shelfIds: ['s1'] },
          { id: 'b2', isbn: '222', title: 'B', author: 'B', pageCount: 0, amazonLink: '', coverImg: '', status: 'read' as const, notes: '', dateAdded: '', shelfIds: ['s1'] },
        ],
      });
      renderWithToast(<ShelfManager />);

      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  /* ── Rename shelf ────────────────────────────────────────── */
  describe('rename', () => {
    it('opens rename form when edit button is clicked', () => {
      useBookStore.setState({ shelves: [makeShelf({ name: 'Fiction' })] });
      renderWithToast(<ShelfManager />);

      fireEvent.click(screen.getByLabelText('Rename Fiction'));
      // Should show an input with the current name
      expect(screen.getByDisplayValue('Fiction')).toBeInTheDocument();
    });

    it('renames shelf when confirmed', () => {
      useBookStore.setState({ shelves: [makeShelf({ id: 's1', name: 'Fiction' })] });
      renderWithToast(<ShelfManager />);

      fireEvent.click(screen.getByLabelText('Rename Fiction'));
      const input = screen.getByDisplayValue('Fiction');
      fireEvent.change(input, { target: { value: 'Literature' } });
      fireEvent.click(screen.getByLabelText('Confirm rename'));

      expect(useBookStore.getState().shelves[0].name).toBe('Literature');
    });

    it('renames shelf on Enter key', () => {
      useBookStore.setState({ shelves: [makeShelf({ id: 's1', name: 'Fiction' })] });
      renderWithToast(<ShelfManager />);

      fireEvent.click(screen.getByLabelText('Rename Fiction'));
      const input = screen.getByDisplayValue('Fiction');
      fireEvent.change(input, { target: { value: 'Classics' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(useBookStore.getState().shelves[0].name).toBe('Classics');
    });

    it('cancels rename on Escape key', () => {
      useBookStore.setState({ shelves: [makeShelf({ id: 's1', name: 'Fiction' })] });
      renderWithToast(<ShelfManager />);

      fireEvent.click(screen.getByLabelText('Rename Fiction'));
      const input = screen.getByDisplayValue('Fiction');
      fireEvent.change(input, { target: { value: 'Changed' } });
      fireEvent.keyDown(input, { key: 'Escape' });

      // Name should remain unchanged
      expect(useBookStore.getState().shelves[0].name).toBe('Fiction');
    });
  });

  /* ── Delete shelf ────────────────────────────────────────── */
  describe('delete', () => {
    it('shows confirm dialog when delete is clicked', async () => {
      useBookStore.setState({ shelves: [makeShelf({ name: 'Fiction' })] });
      renderWithToast(<ShelfManager />);

      await act(async () => {
        fireEvent.click(screen.getByLabelText('Delete Fiction'));
      });

      expect(screen.getByText('Delete Shelf')).toBeInTheDocument();
      expect(screen.getByText(/Delete "Fiction"/)).toBeInTheDocument();
    });

    it('deletes shelf when confirmed', async () => {
      useBookStore.setState({ shelves: [makeShelf({ id: 's1', name: 'Fiction' })] });
      renderWithToast(<ShelfManager />);

      await act(async () => {
        fireEvent.click(screen.getByLabelText('Delete Fiction'));
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Delete'));
      });

      expect(useBookStore.getState().shelves).toHaveLength(0);
    });

    it('mentions book count in confirm message when shelf has books', async () => {
      const shelf = makeShelf({ id: 's1', name: 'Fiction' });
      useBookStore.setState({
        shelves: [shelf],
        books: [
          { id: 'b1', isbn: '111', title: 'A', author: 'A', pageCount: 0, amazonLink: '', coverImg: '', status: 'read' as const, notes: '', dateAdded: '', shelfIds: ['s1'] },
        ],
      });
      renderWithToast(<ShelfManager />);

      await act(async () => {
        fireEvent.click(screen.getByLabelText('Delete Fiction'));
      });

      expect(screen.getByText(/removed from 1 book/)).toBeInTheDocument();
    });
  });
});
