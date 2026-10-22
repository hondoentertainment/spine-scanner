import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RecommendationsView from '../RecommendationsView';
import { ToastProvider } from '../Toast';
import { useBookStore } from '../../store/useBookStore';
import { clearRecommendationCache, writeRecommendationCache } from '../../recommendations/cache';
import { libraryFingerprint } from '../../recommendations/rank';
import type { BookEntry } from '../../types';
import type { BookRecommendation } from '../../recommendations/types';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const shelfBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: overrides.id ?? 'dune',
  isbn: overrides.isbn ?? '9780441172719',
  title: overrides.title ?? 'Dune',
  author: overrides.author ?? 'Frank Herbert',
  pageCount: 400,
  amazonLink: '',
  coverImg: '',
  status: 'read',
  notes: '',
  dateAdded: '2026-01-01T00:00:00.000Z',
  shelfIds: [],
  ...overrides,
});

const suggestion: BookRecommendation = {
  id: 'isbn:9780441013593',
  title: 'Dune Messiah',
  author: 'Frank Herbert',
  isbn: '9780441013593',
  isbns: ['9780441013593'],
  pageCount: 336,
  coverImg: '',
  reason: 'Because you own Dune and Hyperion',
  becauseTitles: ['Dune', 'Hyperion'],
  source: 'open_library',
};

function renderView() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <RecommendationsView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: online });
}

describe('RecommendationsView', () => {
  beforeEach(() => {
    navigate.mockReset();
    localStorage.clear();
    setOnline(true);
    useBookStore.setState({ books: [], shelves: [] });
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no network in test'))));
  });

  afterEach(() => {
    clearRecommendationCache();
    vi.unstubAllGlobals();
  });

  it('shows the shelf reason and adds the book to the to-read list in one tap', async () => {
    const books = [
      shelfBook(),
      shelfBook({ id: 'hyperion', title: 'Hyperion', author: 'Dan Simmons', isbn: '9780553283686' }),
    ];
    useBookStore.setState({ books, shelves: [] });
    writeRecommendationCache({
      fingerprint: libraryFingerprint(books),
      fetchedAt: Date.now(),
      recommendations: [suggestion],
    });

    renderView();

    expect(await screen.findByText('Because you own Dune and Hyperion')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dune Messiah' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add to wishlist: Dune Messiah' }));

    const saved = useBookStore.getState().books.find((book) => book.title === 'Dune Messiah');
    expect(saved?.status).toBe('to-read');
    expect(saved?.isbn).toBe('9780441013593');
    expect(screen.getAllByText(/Added Dune Messiah to your wishlist/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Add to wishlist: Dune Messiah' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(useBookStore.getState().books.find((book) => book.title === 'Dune Messiah')).toBeUndefined();
  });

  it('asks for books before suggesting anything', async () => {
    renderView();
    expect(await screen.findByRole('heading', { name: 'Nothing to suggest yet' })).toBeInTheDocument();
    expect(screen.getByTestId('recommendations-state')).toHaveAttribute('data-state', 'empty');
    expect(await screen.findByText(/Add a few books first/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Add books/ }));
    expect(navigate).toHaveBeenCalledWith('/scan');
  });

  it('shows an offline state with a retry when nothing is saved', async () => {
    setOnline(false);
    useBookStore.setState({ books: [shelfBook()], shelves: [] });
    renderView();
    expect(await screen.findByRole('heading', { name: "You're offline" })).toBeInTheDocument();
    expect(screen.getByTestId('recommendations-state')).toHaveAttribute('data-state', 'offline');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: "You're offline" })).toBeInTheDocument();
  });

  it('shows an error state when suggestions fail to load', async () => {
    useBookStore.setState({ books: [shelfBook()], shelves: [] });
    renderView();
    expect(await screen.findByRole('heading', { name: "Couldn't load suggestions" })).toBeInTheDocument();
    expect(screen.getByTestId('recommendations-state')).toHaveAttribute('data-state', 'error');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('shows a nothing-new state when the catalogs have no suggestions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ docs: [], totalItems: 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));
    useBookStore.setState({ books: [shelfBook()], shelves: [] });
    renderView();
    expect(await screen.findByRole('heading', { name: 'Nothing new yet' })).toBeInTheDocument();
    expect(screen.getByTestId('recommendations-state')).toHaveAttribute('data-state', 'nothing-new');
    fireEvent.click(screen.getByRole('button', { name: 'Add a book' }));
    expect(navigate).toHaveBeenCalledWith('/scan');
  });

  it('shows a saved notice when suggestions cannot be refreshed', async () => {
    const books = [shelfBook()];
    useBookStore.setState({ books, shelves: [] });
    writeRecommendationCache({
      fingerprint: 'older-shelf',
      fetchedAt: 1,
      recommendations: [{
        ...suggestion,
        reason: 'Because you own Dune',
        becauseTitles: ['Dune'],
      }],
    });

    renderView();
    expect(await screen.findByText('Because you own Dune')).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't refresh suggestions/)).toBeInTheDocument();
  });
});
