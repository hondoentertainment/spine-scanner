import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import BookCard from '../BookCard';
import { ToastProvider } from '../Toast';
import { useBookStore } from '../../store/useBookStore';
import type { BookEntry, Shelf } from '../../types';

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'card-1',
  isbn: '9780141036144',
  title: '1984',
  author: 'George Orwell',
  pageCount: 328,
  amazonLink: 'https://amazon.com/dp/0141036141',
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

describe('BookCard', () => {
  beforeEach(() => {
    useBookStore.setState({ books: [], shelves: [] });
  });

  it('renders book title and author', () => {
    const book = makeBook();
    useBookStore.setState({ books: [book] });
    renderWithToast(<BookCard book={book} />);
    expect(screen.getByText('1984')).toBeInTheDocument();
    expect(screen.getByText('George Orwell')).toBeInTheDocument();
  });

  it('shows edit form when Edit button is clicked', () => {
    const book = makeBook();
    useBookStore.setState({ books: [book] });
    renderWithToast(<BookCard book={book} />);

    fireEvent.click(screen.getByLabelText('Edit 1984'));
    expect(screen.getByText('Edit Book')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1984')).toBeInTheDocument();
    expect(screen.getByDisplayValue('George Orwell')).toBeInTheDocument();
  });

  it('saves edited fields', () => {
    const book = makeBook();
    useBookStore.setState({ books: [book] });
    renderWithToast(<BookCard book={book} />);

    fireEvent.click(screen.getByLabelText('Edit 1984'));

    const titleInput = screen.getByDisplayValue('1984');
    fireEvent.change(titleInput, { target: { value: 'Animal Farm' } });

    const authorInput = screen.getByDisplayValue('George Orwell');
    fireEvent.change(authorInput, { target: { value: 'G. Orwell' } });

    fireEvent.click(screen.getByLabelText('Save changes'));

    const updated = useBookStore.getState().books[0];
    expect(updated.title).toBe('Animal Farm');
    expect(updated.author).toBe('G. Orwell');
  });

  it('saves a physical location from the edit form', () => {
    const book = makeBook();
    useBookStore.setState({ books: [book] });
    renderWithToast(<BookCard book={book} />);

    fireEvent.click(screen.getByLabelText('Edit 1984'));
    fireEvent.change(screen.getByLabelText('Location room'), { target: { value: 'Study' } });
    fireEvent.change(screen.getByLabelText('Location case'), { target: { value: 'Oak' } });
    fireEvent.change(screen.getByLabelText('Location shelf'), { target: { value: '2' } });
    fireEvent.click(screen.getByLabelText('Save changes'));

    const updated = useBookStore.getState().books[0];
    expect(updated.locationRoom).toBe('Study');
    expect(updated.locationCase).toBe('Oak');
    expect(updated.locationShelf).toBe('2');
  });

  it('cancels editing without saving', () => {
    const book = makeBook();
    useBookStore.setState({ books: [book] });
    renderWithToast(<BookCard book={book} />);

    fireEvent.click(screen.getByLabelText('Edit 1984'));

    const titleInput = screen.getByDisplayValue('1984');
    fireEvent.change(titleInput, { target: { value: 'Changed Title' } });

    fireEvent.click(screen.getByLabelText('Cancel editing'));

    expect(screen.getByText('1984')).toBeInTheDocument();
    const book1 = useBookStore.getState().books[0];
    expect(book1.title).toBe('1984');
  });

  it('displays shelf chips for assigned shelves', () => {
    const shelf = makeShelf({ id: 's1', name: 'Fiction' });
    const book = makeBook({ shelfIds: ['s1'] });
    useBookStore.setState({ books: [book], shelves: [shelf] });
    renderWithToast(<BookCard book={book} />);
    expect(screen.getByText('Fiction')).toBeInTheDocument();
  });

  it('assigns a shelf via the shelf picker', () => {
    const shelf = makeShelf({ id: 's1', name: 'Sci-Fi' });
    const book = makeBook({ shelfIds: [] });
    useBookStore.setState({ books: [book], shelves: [shelf] });
    renderWithToast(<BookCard book={book} />);

    fireEvent.click(screen.getByLabelText('Add to shelf'));
    fireEvent.click(screen.getByText('Sci-Fi'));

    const updated = useBookStore.getState().books[0];
    expect(updated.shelfIds).toContain('s1');
  });

  it('removes a shelf assignment', () => {
    const shelf = makeShelf({ id: 's1', name: 'Fiction' });
    const book = makeBook({ shelfIds: ['s1'] });
    useBookStore.setState({ books: [book], shelves: [shelf] });
    renderWithToast(<BookCard book={book} />);

    fireEvent.click(screen.getByLabelText('Remove from Fiction'));

    const updated = useBookStore.getState().books[0];
    expect(updated.shelfIds).not.toContain('s1');
  });

  it('updates reading status when status button is clicked', () => {
    const book = makeBook({ status: 'to-read' });
    useBookStore.setState({ books: [book] });
    renderWithToast(<BookCard book={book} />);

    fireEvent.click(screen.getByLabelText('Set status to Read'));
    expect(useBookStore.getState().books[0].status).toBe('read');
  });

  it('shows confirm dialog when Remove button is clicked', async () => {
    const book = makeBook();
    useBookStore.setState({ books: [book] });
    renderWithToast(<BookCard book={book} />);

    // Click remove — should show confirm dialog
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Remove 1984 from library'));
    });

    // Confirm dialog should be visible
    expect(screen.getByText('Remove Book')).toBeInTheDocument();

    // Click the confirm button inside the dialog (not the card's Remove button)
    const allRemoveButtons = screen.getAllByText('Remove');
    // The second one is the dialog confirm button
    await act(async () => {
      fireEvent.click(allRemoveButtons[allRemoveButtons.length - 1]);
    });

    expect(useBookStore.getState().books).toHaveLength(0);
  });

  it('lends a book from the card and marks it returned', () => {
    const book = makeBook();
    useBookStore.setState({ books: [book] });
    renderWithToast(<BookCard book={book} />);

    fireEvent.click(screen.getByRole('button', { name: 'Lend 1984' }));
    fireEvent.change(screen.getByLabelText('Borrower for 1984'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Due date for 1984'), { target: { value: '2026-12-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm lend 1984' }));

    const lent = useBookStore.getState().books[0];
    expect(lent.lentTo).toBe('Ada');
    expect(lent.dueAt).toBe('2026-12-01');
    expect(lent.returnedAt).toBe('');
    expect(lent.loan?.borrowerName).toBe('Ada');
    expect(lent.title).toBe('1984');
  });

  it('shows an overdue badge and records a return', () => {
    const book = makeBook({
      loan: { borrowerName: 'Ada', lentAt: '2020-01-01T00:00:00.000Z', dueAt: '2020-01-02' },
    });
    useBookStore.setState({ books: [book] });
    renderWithToast(<BookCard book={book} />);
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Lent to Ada since 2020-01-01')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mark 1984 returned' }));
    const returned = useBookStore.getState().books[0];
    expect(returned.loan).toBeNull();
    expect(returned.returnedAt).not.toBe('');
    expect(returned.loanLedger?.[0].lentTo).toBe('Ada');
    expect(returned.notes).toBe('');
  });
});
