import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PhysicalShelfMap, { type PhysicalLocationFilter } from '../PhysicalShelfMap';
import type { BookEntry } from '../../types';

const book = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'b1',
  isbn: '9780141036144',
  title: 'Dune',
  author: 'Herbert',
  pageCount: 400,
  amazonLink: '',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: '2026-01-01T00:00:00.000Z',
  shelfIds: [],
  ...overrides,
});

const placed = [
  book({
    id: 'dune',
    title: 'Dune',
    author: 'Herbert',
    locationRoom: 'Study',
    locationCase: 'Oak',
    locationShelf: '2',
  }),
  book({
    id: 'neuro',
    title: 'Neuromancer',
    author: 'Gibson',
    isbn: '9780441569595',
    locationRoom: 'Study',
    locationCase: 'Oak',
    locationShelf: '1',
  }),
  book({
    id: 'hall',
    title: 'Piranesi',
    author: 'Clarke',
    isbn: '9781635575637',
    locationRoom: 'Hall',
    locationCase: 'Pine',
    locationShelf: '1',
  }),
  book({ id: 'loose', title: 'Loose copy', author: 'Nobody' }),
];

const cleared: PhysicalLocationFilter = {
  locationRoom: null,
  locationCase: null,
  locationShelf: null,
};

function MapHarness({
  books = placed,
  onOpenBook,
}: {
  books?: BookEntry[];
  onOpenBook?: (bookId: string) => void;
}) {
  const [filter, setFilter] = useState<PhysicalLocationFilter>(cleared);
  return (
    <PhysicalShelfMap
      books={books}
      locationRoom={filter.locationRoom}
      locationCase={filter.locationCase}
      locationShelf={filter.locationShelf}
      onSelect={setFilter}
      onOpenBook={onOpenBook}
    />
  );
}

describe('PhysicalShelfMap', () => {
  it('explains an empty map', () => {
    render(
      <PhysicalShelfMap books={[]} locationRoom={null} locationCase={null} locationShelf={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByText(/No physical locations yet/)).toBeInTheDocument();
    expect(screen.queryByRole('tree', { name: 'Physical shelf map' })).not.toBeInTheDocument();
  });

  it('labels rooms, cases, and shelves and leaves books with no place off the map', () => {
    render(<MapHarness />);

    expect(screen.getByRole('treeitem', { name: 'Room Study, 2 books' })).toHaveAttribute('aria-level', '1');
    expect(screen.getByRole('treeitem', { name: 'Case Oak in Study, 2 books' })).toHaveAttribute('aria-level', '2');
    expect(screen.getByRole('treeitem', { name: 'Shelf 1 in Oak, Study, 1 book' })).toHaveAttribute('aria-level', '3');
    expect(screen.getByRole('treeitem', { name: 'Shelf 2 in Oak, Study, 1 book' })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: 'Shelf 1 in Pine, Hall, 1 book' })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: 'Room Hall, 1 book' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Room Study' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Case Oak' })).toBeInTheDocument();
    expect(screen.queryByText('Loose copy')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Dune by Herbert' })).toBeInTheDocument();
  });

  it('selects with click, Enter, and Space, announces the selection, and toggles it off', async () => {
    const user = userEvent.setup();
    render(<MapHarness />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');

    await user.click(screen.getByRole('treeitem', { name: 'Room Study, 2 books' }));
    expect(screen.getByRole('treeitem', { name: 'Room Study, 2 books, selected' })).toHaveAttribute('aria-selected', 'true');
    expect(status).toHaveTextContent('Room Study, 2 books selected');

    const shelf = screen.getByRole('treeitem', { name: 'Shelf 2 in Oak, Study, 1 book' });
    shelf.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('treeitem', { name: 'Shelf 2 in Oak, Study, 1 book, selected' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('treeitem', { name: 'Room Study, 2 books' })).toHaveAttribute('aria-selected', 'false');
    expect(status).toHaveTextContent('Shelf 2 in Oak, Study, 1 book selected');

    screen.getByRole('treeitem', { name: 'Case Oak in Study, 2 books' }).focus();
    await user.keyboard(' ');
    expect(screen.getByRole('treeitem', { name: 'Case Oak in Study, 2 books, selected' })).toHaveAttribute('aria-selected', 'true');
    expect(status).toHaveTextContent('Case Oak in Study, 2 books selected');

    await user.keyboard(' ');
    expect(screen.getByRole('treeitem', { name: 'Case Oak in Study, 2 books' })).toHaveAttribute('aria-selected', 'false');
    expect(status).toHaveTextContent('Selection cleared');
  });

  it('moves through rooms, cases, and shelves with Tab and the arrow keys', async () => {
    const user = userEvent.setup();
    render(<MapHarness books={placed.filter((entry) => entry.locationRoom === 'Study')} />);

    await user.tab();
    expect(screen.getByRole('treeitem', { name: 'Room Study, 2 books' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('treeitem', { name: 'Case Oak in Study, 2 books' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('treeitem', { name: 'Shelf 1 in Oak, Study, 1 book' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Open Neuromancer by Gibson' })).toHaveFocus();

    screen.getByRole('treeitem', { name: 'Room Study, 2 books' }).focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('treeitem', { name: 'Case Oak in Study, 2 books' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('treeitem', { name: 'Shelf 1 in Oak, Study, 1 book' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('treeitem', { name: 'Shelf 2 in Oak, Study, 1 book' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('treeitem', { name: 'Shelf 2 in Oak, Study, 1 book' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('treeitem', { name: 'Shelf 1 in Oak, Study, 1 book' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('treeitem', { name: 'Case Oak in Study, 2 books' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('treeitem', { name: 'Shelf 2 in Oak, Study, 1 book' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('treeitem', { name: 'Room Study, 2 books' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('treeitem', { name: 'Room Study, 2 books' })).toHaveFocus();
  });

  it('opens a book from the map with click and with Enter', async () => {
    const user = userEvent.setup();
    const onOpenBook = vi.fn();
    render(<MapHarness onOpenBook={onOpenBook} />);

    await user.click(screen.getByRole('button', { name: 'Open Dune by Herbert' }));
    const neuromancer = screen.getByRole('button', { name: 'Open Neuromancer by Gibson' });
    neuromancer.focus();
    await user.keyboard('{Enter}');

    expect(onOpenBook).toHaveBeenNthCalledWith(1, 'dune');
    expect(onOpenBook).toHaveBeenNthCalledWith(2, 'neuro');
  });

  it('names a book with no author and a place that was left blank', () => {
    render(
      <MapHarness
        books={[
          book({
            id: 'blank',
            title: 'Untitled spine',
            author: '',
            locationRoom: '',
            locationCase: '',
            locationShelf: '3',
          }),
        ]}
      />,
    );

    expect(screen.getByRole('treeitem', { name: 'Room No room, 1 book' })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: 'Case No case in No room, 1 book' })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: 'Shelf 3 in No case, No room, 1 book' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Untitled spine' })).toBeInTheDocument();
  });
});
