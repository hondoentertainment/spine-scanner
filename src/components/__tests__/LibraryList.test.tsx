import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LibraryList from '../LibraryList';
import { ToastProvider } from '../Toast';
import { useBookStore } from '../../store/useBookStore';
import { useProfileStore } from '../../store/useProfileStore';
import { DEFAULT_PREFERENCES } from '../../types';
import type { BookEntry, Shelf } from '../../types';

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

function renderLibraryList(ui: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/library']}>
      <ToastProvider>
        <Routes>
          <Route path="/library" element={ui} />
          <Route path="/data" element={<div data-testid="data-route">Data management</div>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('LibraryList', () => {
  beforeEach(() => {
    useBookStore.setState({ books: [], shelves: [] });
    useProfileStore.setState({ preferences: { ...DEFAULT_PREFERENCES } });
  });

  it('shows the new browsing-focused hero copy', () => {
    renderLibraryList(<LibraryList />);

    expect(screen.getByText('Your library, built for browsing not digging.')).toBeInTheDocument();
    expect(screen.getByText('Build a library that feels easy to use')).toBeInTheDocument();
  });

  it('calls onStartScanning from the empty state', () => {
    const onStartScanning = vi.fn();
    renderLibraryList(<LibraryList onStartScanning={onStartScanning} />);

    fireEvent.click(screen.getByRole('button', { name: /Add your first book/i }));
    expect(onStartScanning).toHaveBeenCalledOnce();
  });

  it('shows recently added books in descending date order', () => {
    useBookStore.setState({
      books: [
        makeBook({ id: 'b1', title: 'Oldest', dateAdded: '2026-01-01T00:00:00.000Z' }),
        makeBook({ id: 'b2', title: 'Newest', dateAdded: '2026-03-01T00:00:00.000Z' }),
        makeBook({ id: 'b3', title: 'Middle', dateAdded: '2026-02-01T00:00:00.000Z' }),
      ],
    });

    renderLibraryList(<LibraryList />);

    const recentButtons = screen.getAllByRole('button').filter((button) =>
      button.textContent?.includes('Newest') || button.textContent?.includes('Middle') || button.textContent?.includes('Oldest')
    );

    expect(recentButtons[0]).toHaveTextContent('Newest');
    expect(recentButtons[1]).toHaveTextContent('Middle');
    expect(recentButtons[2]).toHaveTextContent('Oldest');
  });

  it('filters books by title and can clear filters in one action', () => {
    useBookStore.setState({
      books: [
        makeBook({ id: 'b1', title: '1984' }),
        makeBook({ id: 'b2', isbn: '0743273567', title: 'The Great Gatsby', author: 'Fitzgerald' }),
      ],
    });

    renderLibraryList(<LibraryList />);

    fireEvent.change(screen.getByLabelText('Search library'), { target: { value: 'Gatsby' } });
    expect(screen.getAllByText('The Great Gatsby').length).toBeGreaterThan(0);
    expect(screen.queryByText('1984')).not.toBeInTheDocument();
    expect(screen.getByText('Search: Gatsby')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Clear filters/i }));
    expect(screen.getByLabelText('Search library')).toHaveValue('');
    expect(screen.getAllByText('1984').length).toBeGreaterThan(0);
    expect(screen.getAllByText('The Great Gatsby').length).toBeGreaterThan(0);
  });

  it('shows a reset state when filters remove all books', () => {
    useBookStore.setState({ books: [makeBook()] });
    renderLibraryList(<LibraryList />);

    fireEvent.change(screen.getByLabelText('Search library'), { target: { value: 'zzz nonexistent' } });

    expect(screen.getByText('No books match those filters')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Reset filters/i }));
    expect(screen.getAllByText('1984').length).toBeGreaterThan(0);
  });

  it('filters by status and shows the active status chip', () => {
    useBookStore.setState({
      books: [
        makeBook({ id: 'b1', title: '1984', status: 'read' }),
        makeBook({ id: 'b2', isbn: '0743273567', title: 'Gatsby', status: 'to-read' }),
      ],
    });

    renderLibraryList(<LibraryList />);

    fireEvent.click(screen.getByText('Read'));
    expect(screen.getByText('Status: read')).toBeInTheDocument();
    expect(screen.getAllByText('1984').length).toBeGreaterThan(0);
    expect(screen.queryByText('Gatsby')).not.toBeInTheDocument();
  });

  it('shows shelf filter buttons when shelves exist', () => {
    useBookStore.setState({
      shelves: [makeShelf({ id: 's1', name: 'Fiction' })],
      books: [makeBook({ shelfIds: ['s1'] })],
    });

    renderLibraryList(<LibraryList />);

    expect(screen.getByText('All Shelves')).toBeInTheDocument();
    expect(screen.getAllByText(/Fiction/).length).toBeGreaterThanOrEqual(1);
  });

  it('toggles reading statistics from the hero action', () => {
    useBookStore.setState({ books: [makeBook({ status: 'read', pageCount: 300 })] });
    renderLibraryList(<LibraryList />);

    fireEvent.click(screen.getByRole('button', { name: /Show stats/i }));
    expect(screen.getByText('Total Books')).toBeInTheDocument();
    expect(screen.getByText('Pages Read')).toBeInTheDocument();
  });

  it('opens book detail when initialOpenIsbn matches a book', () => {
    const book = makeBook({ isbn: '9780141036144', title: '1984' });
    useBookStore.setState({ books: [book] });
    const onOpenComplete = vi.fn();

    renderLibraryList(
      <LibraryList initialOpenIsbn="9780141036144" onOpenComplete={onOpenComplete} />,
    );

    expect(screen.getByText(/ISBN: 9780141036144/)).toBeInTheDocument();
    expect(onOpenComplete).toHaveBeenCalled();
  });

  it('navigates to data management when import & export is clicked', () => {
    useBookStore.setState({ books: [makeBook()] });
    renderLibraryList(<LibraryList />);

    fireEvent.click(screen.getByLabelText('Import and export library data'));
    expect(screen.getByTestId('data-route')).toBeInTheDocument();
  });
});