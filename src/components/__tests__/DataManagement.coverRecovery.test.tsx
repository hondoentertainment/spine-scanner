import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DataManagement from '../DataManagement';
import { ToastProvider } from '../Toast';
import { useBookStore } from '../../store/useBookStore';
import type { BookEntry } from '../../types';

const lookupByIsbn = vi.fn();
const refreshMetadata = vi.fn();
vi.mock('../../hooks/useBookLookup', () => ({
  useBookLookup: () => ({ lookupByIsbn, refreshMetadata, loading: false, error: null }),
}));

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'b1',
  isbn: '9780141036144',
  title: '1984',
  author: 'George Orwell',
  pageCount: 328,
  amazonLink: '',
  coverImg: 'https://example.com/cover.jpg',
  status: 'to-read',
  notes: '',
  dateAdded: '2026-01-15T00:00:00.000Z',
  shelfIds: [],
  metadataSource: 'google_books',
  ...overrides,
});

const renderPanel = () =>
  render(
    <ToastProvider>
      <DataManagement />
    </ToastProvider>,
  );

describe('DataManagement — missing-cover recovery', () => {
  beforeEach(() => {
    useBookStore.setState({ books: [], shelves: [] });
    lookupByIsbn.mockReset();
    refreshMetadata.mockReset();
  });

  it('shows how many books are missing covers on the recovery button', () => {
    useBookStore.setState({
      books: [
        makeBook({ id: 'no-cover', coverImg: '' }),
        makeBook({ id: 'has-cover' }),
      ],
    });
    renderPanel();

    expect(screen.getByRole('button', { name: /Recover missing covers \(1\)/ })).toBeInTheDocument();
  });

  it('updates only the cover of books missing one', async () => {
    useBookStore.setState({
      books: [
        makeBook({ id: 'no-cover', coverImg: '', title: 'Original Title' }),
        makeBook({ id: 'has-cover' }),
      ],
    });
    refreshMetadata.mockResolvedValue({
      title: 'Refreshed Title',
      coverImg: 'https://covers.example.com/found.jpg',
    });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Recover missing covers/ }));

    await waitFor(() => {
      expect(screen.getByText(/Done — recovered 1 cover/)).toBeInTheDocument();
    });
    expect(refreshMetadata).toHaveBeenCalledTimes(1);
    expect(refreshMetadata.mock.calls[0][0].id).toBe('no-cover');

    const updated = useBookStore.getState().books.find((b) => b.id === 'no-cover')!;
    expect(updated.coverImg).toBe('https://covers.example.com/found.jpg');
    // The rest of the refresh result must NOT be applied by cover recovery.
    expect(updated.title).toBe('Original Title');
  });

  it('reports when the lookup finds no usable cover', async () => {
    useBookStore.setState({ books: [makeBook({ id: 'no-cover', coverImg: '' })] });
    refreshMetadata.mockResolvedValue(null);
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Recover missing covers/ }));

    await waitFor(() => {
      expect(screen.getByText(/Done — recovered 0 covers/)).toBeInTheDocument();
    });
    const book = useBookStore.getState().books.find((b) => b.id === 'no-cover')!;
    expect(book.coverImg).toBe('');
  });

  it('short-circuits when no books are missing covers', () => {
    useBookStore.setState({ books: [makeBook()] });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Recover missing covers/ }));

    expect(screen.getByText('No books with missing covers found.')).toBeInTheDocument();
    expect(refreshMetadata).not.toHaveBeenCalled();
  });
});
