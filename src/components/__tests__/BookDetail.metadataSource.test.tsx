import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BookDetail from '../BookDetail';
import { ToastProvider } from '../Toast';
import { useBookStore } from '../../store/useBookStore';
import type { BookEntry } from '../../types';

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'meta-detail-1',
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

const renderWithToast = (ui: React.ReactElement) =>
  render(<ToastProvider>{ui}</ToastProvider>);

describe('BookDetail – metadata source', () => {
  beforeEach(() => {
    useBookStore.setState({ books: [], shelves: [] });
  });

  it('displays Google Books source badge', () => {
    const book = makeBook({ metadataSource: 'google_books' });
    useBookStore.setState({ books: [book] });
    renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

    expect(screen.getByText(/Google Books/i)).toBeInTheDocument();
  });

  it('displays Open Library source badge', () => {
    const book = makeBook({ metadataSource: 'open_library' });
    useBookStore.setState({ books: [book] });
    renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

    expect(screen.getByText(/Open Library/i)).toBeInTheDocument();
  });

  it('displays Manual source badge', () => {
    const book = makeBook({ metadataSource: 'manual' });
    useBookStore.setState({ books: [book] });
    renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

    expect(screen.getByText(/Manual/i)).toBeInTheDocument();
  });

  it('does not show source badge for legacy books without metadataSource', () => {
    const book = makeBook();
    useBookStore.setState({ books: [book] });
    const { container } = renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

    expect(container.querySelector('[class*="sourceBadge"]')).not.toBeInTheDocument();
  });

  it('shows refresh metadata button for non-photo books', () => {
    const book = makeBook({ metadataSource: 'google_books' });
    useBookStore.setState({ books: [book] });
    renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

    expect(screen.getByLabelText(/Refresh metadata/i)).toBeInTheDocument();
  });

  it('does not show refresh button for photo-only books', () => {
    const book = makeBook({ isPhotoOnly: true, isbn: 'photo-abc123' });
    useBookStore.setState({ books: [book] });
    renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

    expect(screen.queryByLabelText(/Refresh metadata/i)).not.toBeInTheDocument();
  });

  it('tracks userEditedFields when saving edits', () => {
    const book = makeBook({ metadataSource: 'google_books' });
    useBookStore.setState({ books: [book] });
    renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText(/Edit Details/));
    const titleInput = screen.getByDisplayValue('1984');
    fireEvent.change(titleInput, { target: { value: 'Nineteen Eighty-Four' } });
    fireEvent.click(screen.getByText(/Save/));

    const updated = useBookStore.getState().books[0];
    expect(updated.metadataSource).toBe('manual');
    expect(updated.userEditedFields).toContain('title');
  });

  it('preserves previously edited fields when saving new edits', () => {
    const book = makeBook({
      metadataSource: 'google_books',
      userEditedFields: ['author'],
    });
    useBookStore.setState({ books: [book] });
    renderWithToast(<BookDetail book={book} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText(/Edit Details/));
    const titleInput = screen.getByDisplayValue('1984');
    fireEvent.change(titleInput, { target: { value: 'New Title' } });
    fireEvent.click(screen.getByText(/Save/));

    const updated = useBookStore.getState().books[0];
    expect(updated.userEditedFields).toContain('author');
    expect(updated.userEditedFields).toContain('title');
  });
});
