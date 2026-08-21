import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

describe('DataManagement — import, export, merge, and danger zone', () => {
  const objectUrl = 'blob:mock-url';
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    useBookStore.setState({ books: [], shelves: [] });
    lookupByIsbn.mockReset();
    refreshMetadata.mockReset();
    createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue(objectUrl);
    revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => {
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    clickSpy.mockRestore();
  });

  it('exports every library format plus calendar and Notion', () => {
    useBookStore.setState({ books: [makeBook()], shelves: [{ id: 's1', name: 'Fiction', color: '#6366f1' }] });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Export \(JSON\)/ }));
    fireEvent.click(screen.getByRole('button', { name: /HTML \(Print-friendly\)/ }));
    fireEvent.click(screen.getByRole('button', { name: /Export \(HTML\)/ }));
    fireEvent.click(screen.getByRole('button', { name: /Goodreads CSV/ }));
    fireEvent.click(screen.getByRole('button', { name: /Export \(GOODREADS\)/ }));
    fireEvent.click(screen.getByRole('button', { name: /LibraryThing TSV/ }));
    fireEvent.click(screen.getByRole('button', { name: /Export \(LIBRARYTHING\)/ }));
    fireEvent.click(screen.getByRole('button', { name: /StoryGraph CSV/ }));
    fireEvent.click(screen.getByRole('button', { name: /Export \(STORYGRAPH\)/ }));
    fireEvent.click(screen.getByRole('button', { name: /Export reading calendar/ }));
    fireEvent.click(screen.getByRole('button', { name: /Export to Notion/ }));

    expect(clickSpy).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalled();
    expect(screen.getAllByText('Export downloaded').length).toBeGreaterThan(0);
    expect(screen.getByText('Reading calendar exported')).toBeInTheDocument();
    expect(screen.getByText('Notion CSV exported')).toBeInTheDocument();
  });

  it('imports a JSON backup including new shelves and skips duplicate ISBNs', async () => {
    useBookStore.setState({
      books: [makeBook()],
      shelves: [{ id: 's1', name: 'Fiction', color: '#6366f1' }],
    });
    const payload = JSON.stringify({
      books: [
        makeBook({ id: 'dup', isbn: '9780141036144', title: 'Duplicate 1984' }),
        makeBook({
          id: 'new',
          isbn: '9780544003415',
          title: 'The Hobbit',
          author: 'J.R.R. Tolkien',
          shelfIds: ['s1', 'missing'],
        }),
        makeBook({
          id: 'photo',
          isbn: 'photo-abc',
          isPhotoOnly: true,
          title: 'Photo book',
        }),
      ],
      shelves: [
        { id: 's1', name: 'Fiction', color: '#6366f1' },
        { id: 's2', name: 'Fantasy', color: '#22c55e' },
      ],
    });
    renderPanel();
    const input = screen.getByLabelText('Import books from file');
    fireEvent.change(input, {
      target: { files: [new File([payload], 'backup.json', { type: 'application/json' })] },
    });

    await waitFor(() => {
      expect(screen.getByText(/Imported 2 books/)).toBeInTheDocument();
    });
    expect(useBookStore.getState().shelves.some((s) => s.id === 's2')).toBe(true);
    expect(screen.getByText('Books added: 2')).toBeInTheDocument();
    expect(screen.getByText('Duplicates skipped: 1')).toBeInTheDocument();
  });

  it('falls through invalid JSON into ISBN extraction', async () => {
    renderPanel();
    const input = screen.getByLabelText('Import books from file');
    lookupByIsbn.mockResolvedValue({
      title: 'Extracted',
      authors: ['Author'],
      pageCount: 10,
      thumbnail: '',
      isbn: '9780141036144',
      source: 'google_books',
    });
    fireEvent.change(input, {
      target: { files: [new File(['not-json 9780141036144'], 'backup.json', { type: 'application/json' })] },
    });
    await waitFor(() => {
      expect(screen.getByText(/Imported 1 book/)).toBeInTheDocument();
    });
  });

  it('imports a CSV row via metadata lookup and records lookup errors', async () => {
    lookupByIsbn
      .mockResolvedValueOnce({
        title: 'Looked Up',
        authors: ['A. Writer'],
        pageCount: 99,
        thumbnail: '',
        isbn: '9780141036144',
        source: 'open_library',
      })
      .mockResolvedValueOnce(null);
    renderPanel();
    const csv = 'ISBN,Title\n9780141036144,One\n9780544003415,Two';
    fireEvent.change(screen.getByLabelText('Import books from file'), {
      target: { files: [new File([csv], 'books.csv', { type: 'text/csv' })] },
    });
    await waitFor(() => {
      expect(screen.getByText('Errors: 1')).toBeInTheDocument();
    });
    expect(useBookStore.getState().books[0].title).toBe('Looked Up');
  });

  it('ignores a file input change with no file selected', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Import books from file'), { target: { files: [] } });
    expect(screen.queryByText(/Import Summary/)).not.toBeInTheDocument();
  });

  it('imports a Goodreads CSV and a StoryGraph CSV', async () => {
    renderPanel();
    const goodreads = [
      'Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies',
      '1,GR Book,GR Author,,,,,,="9780141036144",,,,,200,,,,2023-01-01,,,read,,,,,,,',
    ].join('\n');
    fireEvent.change(screen.getByLabelText('Import Goodreads CSV export'), {
      target: { files: [new File([goodreads], 'goodreads.csv', { type: 'text/csv' })] },
    });
    await waitFor(() => {
      expect(screen.getByText(/Imported \d+ book/)).toBeInTheDocument();
    });

    const storygraph = [
      'Title,Authors,ISBN/UID,Format,Type,Read Status,Star Rating,Review,Read Count,Dates Read,Edition Language,Average Rating,Genres,Moods,Pace,Characters,Series,Page Count,Publication Information,Tags,Owned Copies',
      '"SG Book","SG Author","9780544003415",physical,fiction,read,,,0,"",English,4.0,"","","","","",100,"","",0',
    ].join('\n');
    fireEvent.change(screen.getByLabelText('Import StoryGraph CSV export'), {
      target: { files: [new File([storygraph], 'storygraph.csv', { type: 'text/csv' })] },
    });
    await waitFor(() => {
      expect(screen.getAllByText(/Added 1 book from StoryGraph/).length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByRole('button', { name: /Import from StoryGraph/ }));
  });

  it('does nothing when Goodreads or StoryGraph inputs are empty', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Import Goodreads CSV export'), { target: { files: [] } });
    fireEvent.change(screen.getByLabelText('Import StoryGraph CSV export'), { target: { files: [] } });
    expect(screen.queryByText(/Imported/)).not.toBeInTheDocument();
  });

  it('fetches ISBNs from a public page and confirms the import', async () => {
    lookupByIsbn.mockResolvedValue({
      title: 'From web',
      authors: ['Web Author'],
      pageCount: 12,
      thumbnail: '',
      isbn: '9780141036144',
      source: 'google_books',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      text: () => Promise.resolve('ISBN: 9780141036144'),
    }));
    renderPanel();
    fireEvent.change(screen.getByLabelText('URL to import books from'), {
      target: { value: 'https://example.com/list' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }));
    expect(await screen.findByText(/Found/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Import' }));
    await waitFor(() => {
      expect(useBookStore.getState().books[0]?.title).toBe('From web');
    });
  });

  it('falls back to sample ISBNs for Amazon URLs when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('blocked')));
    renderPanel();
    fireEvent.change(screen.getByLabelText('URL to import books from'), {
      target: { value: 'https://www.amazon.com/wishlist' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }));
    expect(await screen.findByText(/Found/)).toBeInTheDocument();
  });

  it('does not fetch when the URL field is empty', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }));
    expect(screen.queryByText(/Found/)).not.toBeInTheDocument();
  });

  it('merges duplicate ISBN rows into the selected keeper', async () => {
    useBookStore.setState({
      books: [
        makeBook({ id: 'keep', title: 'Keep me' }),
        makeBook({ id: 'drop', title: 'Drop me', notes: 'extra' }),
      ],
    });
    renderPanel();
    expect(screen.getByLabelText('Duplicate ISBN entries')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Drop me/));
    fireEvent.click(screen.getByRole('button', { name: /Merge into selected/ }));
    await waitFor(() => {
      expect(useBookStore.getState().books).toHaveLength(1);
    });
  });

  it('merges possible duplicate editions', async () => {
    useBookStore.setState({
      books: [
        makeBook({ id: 'hc', title: 'Dune', author: 'Frank Herbert', isbn: '9780441172719', status: 'read' }),
        makeBook({ id: 'pb', title: 'Dune', author: 'Frank Herbert', isbn: '9780441013593', status: 'reading', pageCount: 0 }),
      ],
    });
    renderPanel();
    expect(screen.getByLabelText('Possible duplicate editions')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Merge into "Dune"/ }));
    await waitFor(() => {
      expect(useBookStore.getState().books).toHaveLength(1);
    });
  });

  it('refreshes books without a metadata source and can cancel mid-run', async () => {
    useBookStore.setState({
      books: [
        makeBook({ id: 'legacy', metadataSource: undefined }),
        makeBook({ id: 'legacy-2', isbn: '9780544003415', metadataSource: undefined }),
      ],
    });
    refreshMetadata.mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve({ title: 'Refreshed' }), 20);
    }));
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Refresh all books without metadata source/ }));
    expect(await screen.findByText(/Refreshing/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.getByText(/Cancelled after/)).toBeInTheDocument();
    });
  });

  it('short-circuits bulk refresh when every book already has a source', () => {
    useBookStore.setState({ books: [makeBook()] });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Refresh all books without metadata source/ }));
    expect(screen.getByText('No books without a metadata source found.')).toBeInTheDocument();
  });

  it('requires DELETE confirmation before clearing the library', async () => {
    const onClose = vi.fn();
    useBookStore.setState({ books: [makeBook(), makeBook({ id: 'b2', isbn: '9780544003415' })] });
    render(
      <ToastProvider>
        <DataManagement onClose={onClose} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Remove all books from library/ }));
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: /Permanently delete all/ });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: /Remove all books from library/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Remove all books from library/ }));
    fireEvent.change(screen.getByLabelText(/Type DELETE to confirm/), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: /Permanently delete all/ }));
    expect(useBookStore.getState().books).toHaveLength(0);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes via the header button when onClose is provided', () => {
    const onClose = vi.fn();
    render(
      <ToastProvider>
        <DataManagement onClose={onClose} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close import and export' }));
    expect(onClose).toHaveBeenCalled();
  });
});
