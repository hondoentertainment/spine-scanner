import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomeFeed from '../HomeFeed';
import { useBookStore } from '../../store/useBookStore';
import { useProfileStore } from '../../store/useProfileStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useSyncQueue } from '../../store/useSyncQueue';
import { DEFAULT_PREFERENCES } from '../../types';
import type { BookEntry } from '../../types';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: overrides.id ?? crypto.randomUUID(),
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

function renderFeed() {
  return render(
    <MemoryRouter>
      <HomeFeed />
    </MemoryRouter>,
  );
}

describe('HomeFeed', () => {
  beforeEach(() => {
    navigate.mockReset();
    useBookStore.setState({ books: [], shelves: [] });
    useProfileStore.setState({ preferences: { ...DEFAULT_PREFERENCES, onboardingCompleted: true } });
    useAuthStore.setState({ user: null, recoveryMode: false });
    useSyncQueue.setState({ pendingChanges: 0, lastSyncedAt: null, lastSyncFailedAt: null, flushing: false });
  });

  it('renders the empty state and starts scanning', () => {
    renderFeed();
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByText(/No books yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Start scanning/ }));
    expect(navigate).toHaveBeenCalledWith('/scan');
  });

  it('navigates from hero actions', () => {
    renderFeed();
    fireEvent.click(screen.getByRole('button', { name: /Add books/ }));
    expect(navigate).toHaveBeenCalledWith('/scan');
    fireEvent.click(screen.getByRole('button', { name: /Open library/ }));
    expect(navigate).toHaveBeenCalledWith('/library');
  });

  it('shows a singular pending sync strip for a signed-in user', () => {
    useAuthStore.setState({ user: { id: 'u1' } as never });
    useSyncQueue.setState({ pendingChanges: 1, lastSyncedAt: null });
    renderFeed();
    expect(screen.getByText('1 local change waiting to sync')).toBeInTheDocument();
  });

  it('shows a plural pending sync strip', () => {
    useAuthStore.setState({ user: { id: 'u1' } as never });
    useSyncQueue.setState({ pendingChanges: 3, lastSyncedAt: null });
    renderFeed();
    expect(screen.getByText('3 local changes waiting to sync')).toBeInTheDocument();
  });

  it('shows last-synced copy when there are no pending changes', () => {
    useAuthStore.setState({ user: { id: 'u1' } as never });
    useSyncQueue.setState({ pendingChanges: 0, lastSyncedAt: new Date().toISOString() });
    renderFeed();
    expect(screen.getByText(/Last synced/)).toBeInTheDocument();
  });

  it('hides the sync strip when signed out', () => {
    useSyncQueue.setState({ pendingChanges: 2, lastSyncedAt: new Date().toISOString() });
    renderFeed();
    expect(screen.queryByText(/waiting to sync/)).not.toBeInTheDocument();
  });

  it('renders book and page goals and links to profile', () => {
    useProfileStore.setState({
      preferences: {
        ...DEFAULT_PREFERENCES,
        onboardingCompleted: true,
        readingGoalBooksPerYear: 12,
        readingGoalPagesPerYear: 4000,
      },
    });
    useBookStore.setState({
      books: [
        makeBook({
          id: 'finished',
          status: 'read',
          finishedAt: `${new Date().getFullYear()}-02-01T00:00:00.000Z`,
          pageCount: 200,
        }),
      ],
    });
    renderFeed();
    expect(screen.getByLabelText('Reading goals this year')).toBeInTheDocument();
    expect(screen.getByText('Books finished')).toBeInTheDocument();
    expect(screen.getByText('Pages finished')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Adjust goals in profile/ }));
    expect(navigate).toHaveBeenCalledWith('/profile');
  });

  it('shows a streak and the longer best-streak note', () => {
    useProfileStore.setState({
      preferences: {
        ...DEFAULT_PREFERENCES,
        onboardingCompleted: true,
        currentStreak: 3,
        longestStreak: 10,
      },
    });
    renderFeed();
    expect(screen.getByText('3-day streak')).toBeInTheDocument();
    expect(screen.getByText('Best: 10 days')).toBeInTheDocument();
  });

  it('omits the best-streak note when it is not higher', () => {
    useProfileStore.setState({
      preferences: {
        ...DEFAULT_PREFERENCES,
        onboardingCompleted: true,
        currentStreak: 4,
        longestStreak: 4,
      },
    });
    renderFeed();
    expect(screen.getByText('4-day streak')).toBeInTheDocument();
    expect(screen.queryByText(/Best:/)).not.toBeInTheDocument();
  });

  it('surfaces an incomplete series and navigates to the library filter', () => {
    useBookStore.setState({
      books: [
        makeBook({ id: 's1', title: 'Book 1', seriesName: 'The Expanse', status: 'read', isbn: '1111111111111' }),
        makeBook({ id: 's2', title: 'Book 2', seriesName: 'The Expanse', status: 'to-read', isbn: '2222222222222' }),
        makeBook({ id: 'solo', title: 'Standalone', seriesName: 'Only One', status: 'to-read', isbn: '3333333333333' }),
        makeBook({
          id: 'done-a',
          title: 'Finished A',
          seriesName: 'Complete Series',
          status: 'read',
          isbn: '4444444444444',
        }),
        makeBook({
          id: 'done-b',
          title: 'Finished B',
          seriesName: 'Complete Series',
          status: 'read',
          isbn: '5555555555555',
        }),
      ],
    });
    renderFeed();
    expect(screen.getByLabelText('Continue a series')).toBeInTheDocument();
    expect(screen.getByText('The Expanse')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /View series/ }));
    expect(navigate).toHaveBeenCalledWith(`/library?series=${encodeURIComponent('The Expanse')}`);
  });

  it('renders year-in-books stats including a singular busiest month', () => {
    const year = new Date().getFullYear();
    useBookStore.setState({
      books: [
        makeBook({
          id: 'y1',
          title: 'January One',
          status: 'read',
          finishedAt: `${year}-01-10T00:00:00.000Z`,
          pageCount: 100,
        }),
        makeBook({
          id: 'y2',
          title: 'January Two',
          status: 'read',
          finishedAt: `${year}-01-20T00:00:00.000Z`,
          pageCount: 50,
        }),
      ],
    });
    renderFeed();
    expect(screen.getByLabelText('Your reading year')).toBeInTheDocument();
    expect(screen.getByText('books finished')).toBeInTheDocument();
    expect(screen.getByText(/January \(2 books\)/)).toBeInTheDocument();
  });

  it('uses singular book wording for a one-book busiest month when two months have finishes', () => {
    const year = new Date().getFullYear();
    useBookStore.setState({
      books: [
        makeBook({
          id: 'y1',
          title: 'March book',
          status: 'read',
          finishedAt: `${year}-03-10T00:00:00.000Z`,
          pageCount: 80,
        }),
        makeBook({
          id: 'y2',
          title: 'June book',
          status: 'read',
          finishedAt: `${year}-06-10T00:00:00.000Z`,
          pageCount: 90,
        }),
      ],
    });
    renderFeed();
    expect(screen.getByText(/\(1 book\)/)).toBeInTheDocument();
  });

  it('shows a singular review-queue banner', () => {
    useBookStore.setState({
      books: [makeBook({ id: 'r1', needsReview: true, title: 'Needs review' })],
    });
    renderFeed();
    expect(screen.getByText('1 book need a quick metadata check.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Open queue/ }));
    expect(navigate).toHaveBeenCalledWith('/library?review=1');
  });

  it('pluralizes the review-queue banner', () => {
    useBookStore.setState({
      books: [
        makeBook({ id: 'r1', needsReview: true, title: 'One' }),
        makeBook({ id: 'r2', needsReview: true, title: 'Two', isbn: '9780544003415' }),
      ],
    });
    renderFeed();
    expect(screen.getByText('2 books need a quick metadata check.')).toBeInTheDocument();
  });

  it('lists suggestions and opens the chosen book', () => {
    useBookStore.setState({
      books: [
        makeBook({ id: 'reading', title: 'Dune', status: 'reading', dateAdded: isoDaysAgo(1) }),
        makeBook({ id: 'want', title: 'Neuromancer', status: 'to-read', isbn: '9780441569595', dateAdded: isoDaysAgo(2) }),
      ],
    });
    renderFeed();
    expect(screen.getByLabelText('Suggestions')).toBeInTheDocument();
    expect(screen.getByText('Continue reading')).toBeInTheDocument();
    expect(screen.getByText('From your want-to-read list')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /Dune/ })[0]);
    expect(navigate).toHaveBeenCalledWith(`/library?isbn=${encodeURIComponent('9780141036144')}`);
  });

  it('renders recently-added stories and activity cards with relative dates', () => {
    useBookStore.setState({
      books: [
        makeBook({ id: 'today', title: 'Today Book', dateAdded: isoDaysAgo(0), status: 'reading' }),
        makeBook({ id: 'yest', title: 'Yesterday Book', dateAdded: isoDaysAgo(1), isbn: '9780000000002' }),
        makeBook({ id: 'mid', title: 'Midweek Book', dateAdded: isoDaysAgo(3), isbn: '9780000000003' }),
        makeBook({ id: 'old', title: 'Older Book', dateAdded: isoDaysAgo(20), isbn: '9780000000004', status: 'read' }),
      ],
    });
    renderFeed();
    expect(screen.getByLabelText('Recently added')).toBeInTheDocument();
    expect(screen.getByText('Added Today')).toBeInTheDocument();
    expect(screen.getByText('Added Yesterday')).toBeInTheDocument();
    expect(screen.getByText('Added 3 days ago')).toBeInTheDocument();
    expect(screen.getAllByText('Want to read').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Finished').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Open Today Book' }));
    expect(navigate).toHaveBeenCalledWith(`/library?isbn=${encodeURIComponent('9780141036144')}`);
    fireEvent.click(screen.getByRole('button', { name: 'Open Older Book' }));
    expect(navigate).toHaveBeenCalledWith(`/library?isbn=${encodeURIComponent('9780000000004')}`);
  });

  it('does not show goals, streak, series, or year stats when those conditions are empty', () => {
    renderFeed();
    expect(screen.queryByLabelText('Reading goals this year')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Reading streak')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Continue a series')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Your reading year')).not.toBeInTheDocument();
  });
});
