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
  useWindowVirtualizer: ({ count }: { count: number }) => ({
    options: { scrollMargin: 0 },
    getTotalSize: () => count * 76,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        start: i * 76,
        size: 76,
        key: i,
      })),
  }),
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

  it('shows only lent books when opened from the lent-out link', () => {
    useBookStore.setState({
      books: [
        makeBook({ id: 'home', title: 'On shelf' }),
        makeBook({
          id: 'out',
          title: 'With Ada',
          loan: { borrowerName: 'Ada', lentAt: '2026-10-01T00:00:00.000Z', dueAt: null },
        }),
      ],
      shelves: [],
    });
    render(
      <MemoryRouter initialEntries={['/library?lent=1']}>
        <ToastProvider>
          <LibraryList />
        </ToastProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('With Ada')).toBeInTheDocument();
    expect(screen.queryByText('On shelf')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove filter: Lent out' })).toBeInTheDocument();
  });

  it('filters to lent-out books and shows an overdue badge', () => {
    useBookStore.setState({
      books: [
        makeBook({ id: 'home', title: 'On shelf' }),
        makeBook({
          id: 'out',
          title: 'With Ada',
          loan: { borrowerName: 'Ada', lentAt: '2026-10-01T00:00:00.000Z', dueAt: '2020-01-01' },
        }),
      ],
    });
    renderLibraryList(<LibraryList />);
    expect(screen.getAllByText('On shelf').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Lent out' }));
    expect(screen.getByText('With Ada')).toBeInTheDocument();
    expect(screen.queryByText('On shelf')).not.toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('shows a compact library summary and explains needs review', () => {
    renderLibraryList(<LibraryList />);

    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByText('Needs review means a title, author, or ISBN still needs a quick check.')).toBeInTheDocument();
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

  it('filters the library by physical room, case, and shelf', () => {
    useBookStore.setState({
      books: [
        makeBook({ id: 'study', title: 'Dune', locationRoom: 'Study', locationCase: 'Oak', locationShelf: '2' }),
        makeBook({ id: 'hall', isbn: '0743273567', title: 'Neuromancer', locationRoom: 'Hall', locationCase: 'Pine', locationShelf: '1' }),
      ],
    });

    renderLibraryList(<LibraryList />);

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.change(screen.getByLabelText('Filter by room'), { target: { value: 'Study' } });
    expect(screen.getByText('Room: Study')).toBeInTheDocument();
    expect(screen.getAllByText('Dune').length).toBeGreaterThan(0);
    expect(screen.queryByText('Neuromancer')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter by shelf label'), { target: { value: '2' } });
    expect(screen.getByText('Shelf: 2')).toBeInTheDocument();
    expect(screen.getAllByText('Dune').length).toBeGreaterThan(0);
  });

  it('shows shelf filter buttons when shelves exist', () => {
    useBookStore.setState({
      shelves: [makeShelf({ id: 's1', name: 'Fiction' })],
      books: [makeBook({ shelfIds: ['s1'] })],
    });

    renderLibraryList(<LibraryList />);

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByText('All Shelves')).toBeInTheDocument();
    expect(screen.getAllByText(/Fiction/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows one compact stats strip and switches library sections', () => {
    useBookStore.setState({
      books: [
        makeBook({ status: 'read', pageCount: 300, title: 'Finished book', locationRoom: 'Study', locationCase: 'Oak', locationShelf: '2' }),
      ],
    });
    renderLibraryList(<LibraryList />);

    expect(screen.getByText('Books')).toBeInTheDocument();
    expect(screen.getByText('Finished')).toBeInTheDocument();
    expect(screen.queryByLabelText('Search library')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Shelves' }));
    expect(screen.getByText('Physical shelf map')).toBeInTheDocument();
    expect(screen.getByText('Finished book')).toBeInTheDocument();
    expect(screen.queryByLabelText('Search library')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'All books' }));
    expect(screen.getByLabelText('Search library')).toBeInTheDocument();
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

  it('treats wishlist as want-to-read and links suggestions', () => {
    useBookStore.setState({
      books: [
        makeBook({ id: 'a', title: 'Owned read', status: 'read' }),
        makeBook({ id: 'b', title: 'Wanted', status: 'to-read', isbn: '9780544003415' }),
      ],
    });
    render(
      <MemoryRouter initialEntries={['/library']}>
        <ToastProvider>
          <Routes>
            <Route path="/library" element={<LibraryList />} />
            <Route path="/recommendations" element={<div>Suggestions page</div>} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Wishlist' }));
    expect(screen.getByText('Status: to read')).toBeInTheDocument();
    expect(screen.getByText('Wanted')).toBeInTheDocument();
    expect(screen.queryByText('Owned read')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Suggestions' }));
    expect(screen.getByText('Suggestions page')).toBeInTheDocument();
  });

  it('navigates to data management when import & export is clicked', () => {
    useBookStore.setState({ books: [makeBook()] });
    renderLibraryList(<LibraryList />);

    fireEvent.click(screen.getByLabelText('Import and export library data'));
    expect(screen.getByTestId('data-route')).toBeInTheDocument();
  });
});