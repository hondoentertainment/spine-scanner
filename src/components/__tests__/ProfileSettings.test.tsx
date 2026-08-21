import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProfileSettings from '../ProfileSettings';
import { ToastProvider } from '../Toast';
import { useBookStore } from '../../store/useBookStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useProfileStore } from '../../store/useProfileStore';
import { useSyncQueue } from '../../store/useSyncQueue';
import { useAnalyticsStore } from '../../store/useAnalyticsStore';
import { DEFAULT_PREFERENCES } from '../../types';
import type { BookEntry } from '../../types';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}));

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: overrides.id ?? 'b1',
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

function renderProfile(props: { onClose?: () => void; inline?: boolean } = { inline: true }) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ProfileSettings {...props} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('ProfileSettings', () => {
  const objectUrl = 'blob:profile';
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    navigate.mockReset();
    localStorage.clear();
    useBookStore.setState({ books: [], shelves: [] });
    useAuthStore.setState({
      user: null,
      profile: null,
      loading: false,
      recoveryMode: false,
    });
    useProfileStore.setState({ preferences: { ...DEFAULT_PREFERENCES, onboardingCompleted: true } });
    useSyncQueue.setState({
      pendingChanges: 0,
      lastSyncedAt: null,
      lastSyncFailedAt: null,
      flushing: false,
      lastGoodSnapshot: null,
      lastGoodSnapshotAt: null,
      hadConflictLastSync: false,
      lastConflictBookIds: [],
    });
    useAnalyticsStore.setState({ events: [] });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue(objectUrl);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => {
    clickSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('renders the local profile hero and empty recent activity', () => {
    renderProfile();
    expect(screen.getByRole('heading', { name: /Profile & Settings/ })).toBeInTheDocument();
    expect(screen.getByText('Local reader')).toBeInTheDocument();
    expect(screen.getByText('Saved locally on this device')).toBeInTheDocument();
    expect(screen.getByText(/Scan a few books to build your profile/)).toBeInTheDocument();
    expect(screen.getByText(/Local profile - sign in to sync/)).toBeInTheDocument();
  });

  it('uses profile, avatar, and joined date when a user is signed in', () => {
    useAuthStore.setState({
      user: {
        id: 'u1',
        email: 'reader@example.com',
        created_at: '2024-03-01T00:00:00.000Z',
        user_metadata: { full_name: 'Fallback Name', avatar_url: 'https://example.com/a.png' },
      } as never,
      profile: { username: 'hondo', displayName: 'Hondo', avatarUrl: 'https://example.com/me.png' },
    });
    useBookStore.setState({
      books: [
        makeBook({ id: 'r1', status: 'read', coverImg: 'https://covers.example/1.jpg' }),
        makeBook({ id: 'r2', status: 'reading', title: 'Dune', isbn: '9780441172719' }),
        makeBook({ id: 'r3', status: 'dnf', title: 'Skipped', isbn: '9780000000001' }),
      ],
      shelves: [{ id: 's1', name: 'Fiction', color: '#6366f1' }],
    });
    renderProfile();
    expect(screen.getByText('hondo')).toBeInTheDocument();
    expect(screen.getByText('reader@example.com')).toBeInTheDocument();
    expect(screen.getByText(/Since March 2024/)).toBeInTheDocument();
    expect(document.querySelector('img')?.getAttribute('src')).toBe('https://example.com/me.png');
  });

  it('falls back to user metadata display name when the profile is empty', () => {
    useAuthStore.setState({
      user: { id: 'u1', email: 'a@b.com', user_metadata: { full_name: 'Meta Name' } } as never,
      profile: null,
    });
    renderProfile();
    expect(screen.getByText('Meta Name')).toBeInTheDocument();
  });

  it('opens the changelog modal', async () => {
    renderProfile();
    fireEvent.click(screen.getByRole('button', { name: /What's new/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('updates theme, sort, view, status, and shortcut toggles', () => {
    renderProfile();
    fireEvent.click(screen.getByRole('button', { name: /Light/ }));
    expect(useProfileStore.getState().preferences.theme).toBe('light');
    fireEvent.click(screen.getByRole('button', { name: 'Title' }));
    expect(useProfileStore.getState().preferences.librarySortBy).toBe('title');
    fireEvent.click(screen.getByRole('button', { name: /Z -> A/ }));
    expect(useProfileStore.getState().preferences.librarySortAsc).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /List/ }));
    expect(useProfileStore.getState().preferences.libraryViewMode).toBe('list');
    fireEvent.click(screen.getByRole('button', { name: 'Reading' }));
    expect(useProfileStore.getState().preferences.libraryStatusFilter).toBe('reading');
    fireEvent.click(screen.getByRole('button', { name: /Start in batch mode/ }));
    expect(useProfileStore.getState().preferences.batchModeDefault).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Warn on duplicate ISBN/ }));
    expect(useProfileStore.getState().preferences.warnOnDuplicateIsbn).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Show stats by default/ }));
    expect(useProfileStore.getState().preferences.showStatsDefault).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Show shelves by default/ }));
    expect(useProfileStore.getState().preferences.showShelvesDefault).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Replay first-run tour/ }));
    expect(useProfileStore.getState().preferences.onboardingCompleted).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Anonymous usage analytics/ }));
    expect(useProfileStore.getState().preferences.analyticsOptIn).toBe(true);
  });

  it('updates reading goals including the empty and invalid paths', () => {
    renderProfile();
    fireEvent.change(screen.getByLabelText(/Books finished/), { target: { value: '12' } });
    expect(useProfileStore.getState().preferences.readingGoalBooksPerYear).toBe(12);
    fireEvent.change(screen.getByLabelText(/Books finished/), { target: { value: '' } });
    expect(useProfileStore.getState().preferences.readingGoalBooksPerYear).toBeNull();
    fireEvent.change(screen.getByLabelText(/Pages finished/), { target: { value: '0' } });
    expect(useProfileStore.getState().preferences.readingGoalPagesPerYear).toBe(0);
    fireEvent.change(screen.getByLabelText(/Pages finished/), { target: { value: '4000' } });
    expect(useProfileStore.getState().preferences.readingGoalPagesPerYear).toBe(4000);
  });

  it('shows Never / Just now / minutes-ago / date sync labels', () => {
    useAuthStore.setState({ user: { id: 'u1', email: 'a@b.com' } as never });
    useSyncQueue.setState({ lastSyncedAt: null, pendingChanges: 0 });
    const { unmount } = renderProfile();
    expect(screen.getByText('Never')).toBeInTheDocument();
    unmount();

    useSyncQueue.setState({ lastSyncedAt: new Date().toISOString(), pendingChanges: 1 });
    const second = renderProfile();
    expect(screen.getByText('Just now')).toBeInTheDocument();
    expect(screen.getByText('1 change pending')).toBeInTheDocument();
    second.unmount();

    useSyncQueue.setState({
      lastSyncedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      pendingChanges: 3,
    });
    const third = renderProfile();
    expect(screen.getByText('5 minutes ago')).toBeInTheDocument();
    expect(screen.getByText('3 changes pending')).toBeInTheDocument();
    third.unmount();

    useSyncQueue.setState({
      lastSyncedAt: new Date('2024-01-15T00:00:00.000Z').toISOString(),
      pendingChanges: 0,
      flushing: true,
    });
    renderProfile();
    expect(screen.getByText('Syncing…')).toBeInTheDocument();
  });

  it('shows a sync-failure warning and conflict list with extras', async () => {
    const books = [
      ...Array.from({ length: 21 }, (_, i) =>
        makeBook({ id: `c${i}`, title: `Conflict ${i}`, isbn: `97800000000${String(i).padStart(2, '0')}` }),
      ),
    ];
    useBookStore.setState({ books, shelves: [] });
    useAuthStore.setState({ user: { id: 'u1', email: 'a@b.com' } as never });
    useSyncQueue.setState({
      lastSyncFailedAt: Date.now(),
      hadConflictLastSync: true,
      lastConflictBookIds: books.map((b) => b.id),
    });
    renderProfile();
    expect(screen.getByText(/Sync failed — check your connection/)).toBeInTheDocument();
    expect(screen.getByText(/conflicting edits on another device for 21 books/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Which books?'));
    expect(screen.getByText(/\+ 1 more/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[0]);
    expect(navigate).toHaveBeenCalledWith(`/library?isbn=${encodeURIComponent(books[0].isbn)}`);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(useSyncQueue.getState().hadConflictLastSync).toBe(false);
  });

  it('uses singular wording for a single conflicted book', () => {
    useBookStore.setState({ books: [makeBook({ id: 'only' })], shelves: [] });
    useAuthStore.setState({ user: { id: 'u1' } as never });
    useSyncQueue.setState({
      hadConflictLastSync: true,
      lastConflictBookIds: ['only'],
    });
    renderProfile();
    expect(screen.getByText(/for 1 book/)).toBeInTheDocument();
  });

  it('restores a good snapshot and reports parse failures', async () => {
    useAuthStore.setState({ user: { id: 'u1' } as never });
    useSyncQueue.setState({
      lastGoodSnapshot: JSON.stringify([makeBook({ id: 'snap', title: 'Restored' })]),
      lastGoodSnapshotAt: new Date().toISOString(),
    });
    const first = renderProfile();
    fireEvent.click(screen.getByRole('button', { name: /Restore from snapshot/ }));
    expect(await screen.findByText('Library restored from snapshot')).toBeInTheDocument();
    expect(useBookStore.getState().books[0].title).toBe('Restored');
    first.unmount();

    useSyncQueue.setState({ lastGoodSnapshot: '{not-json', lastGoodSnapshotAt: null });
    renderProfile();
    fireEvent.click(screen.getByRole('button', { name: /Restore from snapshot/ }));
    expect(await screen.findByText('Failed to restore snapshot')).toBeInTheDocument();
  });

  it('cancels clearing local data and also completes the confirm path', async () => {
    renderProfile();
    fireEvent.click(screen.getByRole('button', { name: /Clear all local data/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Local data cleared')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Clear all local data/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear local data' }));
    expect(await screen.findByText('Local data cleared')).toBeInTheDocument();
  });

  it('copies the library link and reports clipboard failure', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderProfile();
    fireEvent.click(screen.getByRole('button', { name: /Copy library link/ }));
    expect(await screen.findByText('Library link copied')).toBeInTheDocument();

    writeText.mockRejectedValueOnce(new Error('denied'));
    fireEvent.click(screen.getByRole('button', { name: /Copy library link/ }));
    expect(await screen.findByText('Could not copy link')).toBeInTheDocument();
  });

  it('navigates to import/export and downloads account + diagnostics files', async () => {
    renderProfile();
    fireEvent.click(screen.getByRole('button', { name: /Import & export/ }));
    expect(navigate).toHaveBeenCalledWith('/data');
    fireEvent.click(screen.getByRole('button', { name: /Download my data/ }));
    expect(await screen.findByText('Account data downloaded')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Download diagnostics/ }));
    expect(await screen.findByText('Diagnostics downloaded')).toBeInTheDocument();
  });

  it('cancels the delete-all confirmation', async () => {
    renderProfile();
    fireEvent.click(screen.getByRole('button', { name: /Delete all my data/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('All data deleted')).not.toBeInTheDocument();
  });

  it('renders scan statistics with green, amber, and red success rates', () => {
    const now = new Date().toISOString();
    useAnalyticsStore.setState({
      events: [
        { type: 'scan_barcode_success', timestamp: now },
        { type: 'scan_barcode_success', timestamp: now },
        { type: 'scan_barcode_success', timestamp: now },
        { type: 'scan_ocr_success', timestamp: now },
      ],
    });
    const { unmount } = renderProfile();
    expect(screen.getByText('Scan statistics')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    unmount();

    useAnalyticsStore.setState({
      events: [
        { type: 'scan_barcode_success', timestamp: now },
        { type: 'scan_failure', timestamp: now },
      ],
    });
    const mid = renderProfile();
    expect(screen.getByText('50%')).toBeInTheDocument();
    mid.unmount();

    useAnalyticsStore.setState({
      events: [
        { type: 'scan_failure', timestamp: now },
        { type: 'scan_failure', timestamp: now },
        { type: 'scan_barcode_success', timestamp: now },
      ],
    });
    renderProfile();
    expect(screen.getByText('33%')).toBeInTheDocument();
  });

  it('closes the modal via the close button and overlay click', () => {
    const onClose = vi.fn();
    renderProfile({ inline: false, onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(onClose).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
