import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ToastProvider } from '../components/Toast';
import { useBookStore } from '../store/useBookStore';
import { useAuthStore } from '../store/useAuthStore';
import { useProfileStore } from '../store/useProfileStore';
import { useSyncQueue } from '../store/useSyncQueue';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { DEFAULT_PREFERENCES } from '../types';
import type { BookEntry } from '../types';
import { uiContracts } from '../testing/uiContracts';

const {
  lookupByIsbn,
  mergeSync,
  pushBooks,
  isSupabaseConfigured,
  onlineState,
} = vi.hoisted(() => ({
  lookupByIsbn: vi.fn(),
  mergeSync: vi.fn(),
  pushBooks: vi.fn(),
  isSupabaseConfigured: vi.fn(() => false),
  onlineState: {
    online: true,
    justReconnected: false,
    clearReconnected: vi.fn(),
  },
}));

vi.mock('../hooks/useBookLookup.ts', () => ({
  useBookLookup: () => ({
    lookupByIsbn,
    loading: Boolean((globalThis as { __lookupLoading?: boolean }).__lookupLoading),
    error: ((globalThis as { __lookupError?: string | null }).__lookupError) ?? null,
  }),
}));

vi.mock('../lib/syncBooks.ts', () => ({
  mergeSync: (...args: unknown[]) => mergeSync(...args),
  pushBooks: (...args: unknown[]) => pushBooks(...args),
}));

vi.mock('../lib/supabase.ts', () => ({
  supabase: null,
  isSupabaseConfigured: () => isSupabaseConfigured(),
}));

vi.mock('../hooks/useOnlineStatus.ts', () => ({
  useOnlineStatus: () => onlineState,
}));

vi.mock('../components/Scanner.tsx', () => ({
  default: (props: {
    onScan: (isbn: string, options?: { allowReview?: boolean; source?: string }) => void;
    onPhotoCapture: (dataUrl: string) => void;
    onViewLibrary: (isbn?: string) => void;
    onOpenSupport: () => void;
    onOpenPrivacy: () => void;
  }) => (
    <div data-testid="mock-scanner">
      <button type="button" onClick={() => props.onScan('9780141036144')}>scan-valid</button>
      <button type="button" onClick={() => props.onScan('978-0-141-03614-4')}>scan-hyphenated</button>
      <button type="button" onClick={() => props.onScan('123')}>scan-invalid</button>
      <button type="button" onClick={() => props.onScan('123', { allowReview: true, source: 'manual' })}>
        scan-invalid-review
      </button>
      <button type="button" onClick={() => props.onScan('9780141036144', { source: 'manual' })}>
        scan-manual
      </button>
      <button type="button" onClick={() => props.onPhotoCapture('data:image/png;base64,abc')}>
        capture-photo
      </button>
      <button type="button" onClick={() => props.onViewLibrary('9780141036144')}>view-isbn</button>
      <button type="button" onClick={() => props.onViewLibrary()}>view-library</button>
      <button type="button" onClick={props.onOpenSupport}>open-support</button>
      <button type="button" onClick={props.onOpenPrivacy}>open-privacy</button>
    </div>
  ),
}));

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

vi.mock('../components/LibraryList.tsx', () => ({
  default: function MockLibraryList(props: {
    onStartScanning?: () => void;
    initialOpenIsbn?: string | null;
    onOpenComplete?: () => void;
    initialSeriesFilter?: string | null;
  }) {
    return (
      <div data-testid="mock-library">
        <span>open-isbn:{props.initialOpenIsbn ?? ''}</span>
        <span>series:{props.initialSeriesFilter ?? ''}</span>
        <button type="button" onClick={props.onStartScanning}>start-scanning</button>
        <button type="button" onClick={props.onOpenComplete}>finish-open</button>
      </div>
    );
  },
}));

vi.mock('../components/HomeFeed.tsx', () => ({
  default: () => <div data-testid="mock-home">Home feed stub</div>,
}));

vi.mock('../components/DataManagement.tsx', () => ({
  default: (props: { onClose?: () => void }) => (
    <div data-testid="mock-data">
      <button type="button" onClick={props.onClose}>close-data</button>
    </div>
  ),
}));

vi.mock('../components/ProfileSettings.tsx', () => ({
  default: () => <div data-testid="mock-profile">Profile stub</div>,
}));

vi.mock('../components/PasswordReset.tsx', () => ({
  default: (props: { onComplete: () => void }) => (
    <div data-testid="mock-password-reset">
      <button type="button" onClick={props.onComplete}>finish-recovery</button>
    </div>
  ),
}));

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'book-1',
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

const fakeUser = { id: 'user-1', email: 'reader@example.com' };

function renderApp(initialPath = '/home') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </MemoryRouter>,
  );
}

function resetStores() {
  localStorage.clear();
  sessionStorage.clear();
  useBookStore.setState({ books: [], shelves: [] });
  useAuthStore.setState({
    user: null,
    session: null,
    profile: null,
    loading: false,
    error: null,
    magicLinkSent: false,
    confirmationPending: false,
    recoveryMode: false,
    initialize: vi.fn().mockResolvedValue(undefined),
  });
  useProfileStore.setState({
    preferences: { ...DEFAULT_PREFERENCES, onboardingCompleted: true },
    loadFromCloud: vi.fn().mockResolvedValue(undefined),
    saveToCloud: vi.fn().mockResolvedValue(undefined),
  });
  useSyncQueue.setState({
    pendingChanges: 0,
    lastSyncedAt: null,
    lastSyncFailedAt: null,
    flushing: false,
  });
  useAnalyticsStore.setState({ events: [] });
  lookupByIsbn.mockReset();
  mergeSync.mockReset();
  pushBooks.mockReset();
  isSupabaseConfigured.mockReturnValue(false);
  onlineState.online = true;
  onlineState.justReconnected = false;
  onlineState.clearReconnected.mockReset();
  lookupByIsbn.mockResolvedValue({
    title: 'The Great Gatsby',
    authors: ['F. Scott Fitzgerald'],
    pageCount: 180,
    thumbnail: 'https://example.com/cover.jpg',
    isbn: '9780141036144',
    source: 'google_books',
  });
  mergeSync.mockResolvedValue(null);
  pushBooks.mockResolvedValue(undefined);
  (globalThis as { __lookupLoading?: boolean }).__lookupLoading = false;
  (globalThis as { __lookupError?: string | null }).__lookupError = null;
}

describe('App', () => {
  beforeEach(() => {
    resetStores();
    window.scrollTo = vi.fn();
    try {
      vi.spyOn(window.location, 'reload').mockImplementation(() => undefined);
    } catch {
      // jsdom may not allow spying on location.reload
    }
    window.history.replaceState(null, '', '/');
    window.location.hash = '';
    if (!window.matchMedia) {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: String(query).includes('reduce'),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
        })),
      });
    }
    if (typeof globalThis.requestIdleCallback === 'undefined') {
      globalThis.requestIdleCallback = ((cb: IdleRequestCallback) => {
        cb({ didTimeout: false, timeRemaining: () => 1 } as IdleDeadline);
        return 1;
      }) as typeof requestIdleCallback;
      globalThis.cancelIdleCallback = vi.fn();
    }
  });

  afterEach(() => {
    window.location.hash = '';
  });

  it('renders branding, skip link, and main navigation', async () => {
    renderApp('/home');
    expect(screen.getByRole('link', { name: /Skip to main content/ })).toBeInTheDocument();
    expect(screen.getByTestId(uiContracts.navTabTestId('home'))).toBeInTheDocument();
    expect(screen.getByTestId(uiContracts.navTabTestId('scan'))).toBeInTheDocument();
    expect(screen.getByTestId(uiContracts.navTabTestId('library'))).toBeInTheDocument();
    expect(screen.getByTestId(uiContracts.navTabTestId('profile'))).toBeInTheDocument();
    expect(await screen.findByTestId('mock-home')).toBeInTheDocument();
  });

  it('announces skip-to-main and focuses the landmark', async () => {
    renderApp('/home');
    fireEvent.click(screen.getByRole('link', { name: /Skip to main content/ }));
    await waitFor(() => {
      expect(document.getElementById('main-content')).toHaveFocus();
    });
  });

  it('opens public pages from the footer and returns home', async () => {
    renderApp('/home');
    fireEvent.click(screen.getByRole('button', { name: 'About' }));
    expect(await screen.findByRole('heading', { name: /A faster way to catalog real books/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Back to app/ }));
    expect(await screen.findByTestId('mock-home')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Terms' }));
    expect(await screen.findByRole('heading', { name: /Simple rules for using the site/ })).toBeInTheDocument();
  });

  it('migrates hash public URLs and book deep links', async () => {
    window.location.hash = '#privacy';
    renderApp('/home');
    expect(await screen.findByRole('heading', { name: /Your library stays yours/ })).toBeInTheDocument();
  });

  it('adds a scanned book when metadata is found', async () => {
    useProfileStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, onboardingCompleted: true, batchModeDefault: true },
    });
    renderApp('/scan');
    expect(await screen.findByTestId('mock-scanner')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'scan-valid' }));
    await waitFor(() => {
      expect(useBookStore.getState().books).toHaveLength(1);
    });
    expect(useBookStore.getState().books[0].title).toBe('The Great Gatsby');
  });

  it('rejects an invalid ISBN without review permission', async () => {
    renderApp('/scan');
    await screen.findByTestId('mock-scanner');
    fireEvent.click(screen.getByRole('button', { name: 'scan-invalid' }));
    expect(await screen.findByText(/That ISBN looks incomplete/)).toBeInTheDocument();
    expect(useBookStore.getState().books).toHaveLength(0);
  });

  it('adds an invalid ISBN for review when allowed', async () => {
    useProfileStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, onboardingCompleted: true, batchModeDefault: true },
    });
    renderApp('/scan');
    await screen.findByTestId('mock-scanner');
    fireEvent.click(screen.getByRole('button', { name: 'scan-invalid-review' }));
    await waitFor(() => {
      expect(useBookStore.getState().books[0]?.needsReview).toBe(true);
    });
    expect(useBookStore.getState().books[0].title).toBe('Review ISBN Entry');
  });

  it('offers to open a duplicate ISBN already in the library', async () => {
    useBookStore.setState({ books: [makeBook()], shelves: [] });
    renderApp('/scan');
    await screen.findByTestId('mock-scanner');
    fireEvent.click(screen.getByRole('button', { name: 'scan-valid' }));
    expect(await screen.findByText('Book already in library')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open in library' }));
    expect(screen.queryByText('Book already in library')).not.toBeInTheDocument();
  });

  it('dismisses the duplicate dialog without navigating', async () => {
    useBookStore.setState({ books: [makeBook()], shelves: [] });
    renderApp('/scan');
    await screen.findByTestId('mock-scanner');
    fireEvent.click(screen.getByRole('button', { name: 'scan-valid' }));
    expect(await screen.findByText('Book already in library')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.getByTestId('mock-scanner')).toBeInTheDocument();
  });

  it('keeps scanning in batch mode when a duplicate is found', async () => {
    useBookStore.setState({ books: [makeBook()], shelves: [] });
    useProfileStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, onboardingCompleted: true, batchModeDefault: true },
    });
    renderApp('/scan');
    await screen.findByTestId('mock-scanner');
    fireEvent.click(screen.getByRole('button', { name: 'scan-valid' }));
    expect(await screen.findByText('Already in your library. Keep scanning.')).toBeInTheDocument();
    expect(screen.getByTestId('mock-scanner')).toBeInTheDocument();
  });

  it('adds a book without metadata when the user confirms', async () => {
    useProfileStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, onboardingCompleted: true, batchModeDefault: true },
    });
    lookupByIsbn.mockResolvedValueOnce(null);
    renderApp('/scan');
    await screen.findByTestId('mock-scanner');
    fireEvent.click(screen.getByRole('button', { name: 'scan-valid' }));
    expect(await screen.findByText('No metadata found')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add anyway' }));
    await waitFor(() => {
      expect(useBookStore.getState().books[0]?.title).toBe('Unknown Title');
    });
    expect(useBookStore.getState().books[0].needsReview).toBe(true);
  });

  it('toasts an error when metadata is missing and the user cancels', async () => {
    lookupByIsbn.mockResolvedValueOnce(null);
    renderApp('/scan');
    await screen.findByTestId('mock-scanner');
    fireEvent.click(screen.getByRole('button', { name: 'scan-valid' }));
    expect(await screen.findByText('No metadata found')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('No metadata found for that ISBN.')).toBeInTheDocument();
  });

  it('toasts when lookup throws', async () => {
    lookupByIsbn.mockRejectedValueOnce(new Error('network'));
    renderApp('/scan');
    await screen.findByTestId('mock-scanner');
    fireEvent.click(screen.getByRole('button', { name: 'scan-valid' }));
    expect(await screen.findByText('Book lookup failed. Try again or add the ISBN manually.')).toBeInTheDocument();
  });

  it('adds a photo-only book and opens it in the library', async () => {
    useProfileStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, onboardingCompleted: true, batchModeDefault: true },
    });
    renderApp('/scan');
    await screen.findByTestId('mock-scanner');
    fireEvent.click(screen.getByRole('button', { name: 'capture-photo' }));
    await waitFor(() => {
      expect(useBookStore.getState().books[0]?.isPhotoOnly).toBe(true);
    });
  });

  it('warns when photo capture cloud sync fails', async () => {
    useAuthStore.setState({ user: fakeUser as never });
    onlineState.online = true;
    pushBooks.mockRejectedValueOnce(new Error('offline'));
    renderApp('/scan');
    await screen.findByTestId('mock-scanner');
    fireEvent.click(screen.getByRole('button', { name: 'capture-photo' }));
    expect(await screen.findByText('Cloud sync failed. Changes saved locally.')).toBeInTheDocument();
  });

  it('stays on the scanner in batch mode and supports undo', async () => {
    useProfileStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, onboardingCompleted: true, batchModeDefault: true },
    });
    renderApp('/scan');
    await screen.findByTestId('mock-scanner');
    fireEvent.click(screen.getByRole('button', { name: 'scan-valid' }));
    expect(await screen.findByText('Added. Ready for the next book.')).toBeInTheDocument();
    expect(screen.getByText(/Batch mode: you'll stay on scanner/)).toBeInTheDocument();
    expect(screen.getByTestId('mock-scanner')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(useBookStore.getState().books).toHaveLength(0);
    });
  });

  it('summarizes a batch session when leaving the scanner', async () => {
    useProfileStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, onboardingCompleted: true, batchModeDefault: true },
    });
    renderApp('/scan');
    await screen.findByTestId('mock-scanner');
    fireEvent.click(screen.getByRole('button', { name: 'scan-valid' }));
    await screen.findByText('Added. Ready for the next book.');
    fireEvent.click(screen.getByTestId(uiContracts.navTabTestId('profile')));
    expect(await screen.findByText(/Batch complete — you added 1 book this session/)).toBeInTheDocument();
  });

  it('toggles batch mode from the scan header', async () => {
    renderApp('/scan');
    await screen.findByTestId('mock-scanner');
    const toggle = screen.getByRole('button', { name: /Batch add/ });
    fireEvent.click(toggle);
    expect(useProfileStore.getState().preferences.batchModeDefault).toBe(true);
  });

  it('shows lookup errors on the scan view', async () => {
    (globalThis as { __lookupError?: string | null }).__lookupError = 'ISBN service unavailable';
    renderApp('/scan');
    expect(await screen.findByText('ISBN service unavailable')).toBeInTheDocument();
  });

  it('renders marketing hero actions and scan tips on /scan', async () => {
    renderApp('/scan');
    expect(await screen.findByText(/Add books in seconds/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Start scanning/ }));
    expect(screen.getByText(/Three easy ways to capture a book/)).toBeInTheDocument();
  });

  it('opens support and privacy from the scanner stubs', async () => {
    renderApp('/scan');
    await screen.findByTestId('mock-scanner');
    fireEvent.click(screen.getByRole('button', { name: 'open-support' }));
    expect(await screen.findByRole('heading', { name: /Help for scanning/ })).toBeInTheDocument();
  });

  it('copies and downloads support diagnostics from the support page', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderApp('/home');
    fireEvent.click(screen.getByRole('button', { name: 'Support' }));
    expect(await screen.findByRole('heading', { name: /Help for scanning/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Copy diagnostics/ }));
    expect(await screen.findByText(/Diagnostics copied/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Download JSON/ }));
    expect(await screen.findByText(/Diagnostics downloaded/)).toBeInTheDocument();
    clickSpy.mockRestore();
  });

  it('closes data management back to profile', async () => {
    renderApp('/data');
    expect(await screen.findByTestId('mock-data')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'close-data' }));
    expect(await screen.findByTestId('mock-profile')).toBeInTheDocument();
  });

  it('redirects unknown routes to home', async () => {
    renderApp('/not-a-real-route');
    expect(await screen.findByTestId('mock-home')).toBeInTheDocument();
  });

  it('redirects / to home in full mode', async () => {
    renderApp('/');
    expect(await screen.findByTestId('mock-home')).toBeInTheDocument();
  });

  it('runs an initial cloud sync when a user is present', async () => {
    mergeSync.mockResolvedValueOnce({
      books: [makeBook({ title: 'From cloud' })],
      shelves: [{ id: 's1', name: 'Fiction', color: '#6366f1' }],
    });
    useAuthStore.setState({ user: fakeUser as never });
    renderApp('/home');
    await waitFor(() => {
      expect(useBookStore.getState().books[0]?.title).toBe('From cloud');
    });
    expect(useBookStore.getState().shelves).toHaveLength(1);
  });

  it('flushes pending changes from the header sync pill', async () => {
    isSupabaseConfigured.mockReturnValue(true);
    useAuthStore.setState({ user: fakeUser as never });
    useSyncQueue.setState({ pendingChanges: 2, lastSyncedAt: null, flushing: false });
    mergeSync.mockResolvedValue({
      books: [makeBook()],
      shelves: [],
    });
    renderApp('/home');
    const pill = await screen.findByRole('button', { name: /Sync 2 pending changes/ });
    fireEvent.click(pill);
    await waitFor(() => {
      expect(mergeSync).toHaveBeenCalled();
    });
  });

  it('disables the sync pill while offline', async () => {
    isSupabaseConfigured.mockReturnValue(true);
    onlineState.online = false;
    useAuthStore.setState({ user: fakeUser as never });
    useSyncQueue.setState({ pendingChanges: 1, flushing: false });
    renderApp('/home');
    const pill = await screen.findByRole('button', { name: /Sync one pending change/ });
    expect(pill).toBeDisabled();
    expect(pill).toHaveTextContent('Offline');
  });

  it('migrates a legacy theme preference out of localStorage', async () => {
    localStorage.setItem('spine-scanner-theme', 'light');
    renderApp('/home');
    await waitFor(() => {
      expect(useProfileStore.getState().preferences.theme).toBe('light');
    });
    expect(localStorage.getItem('spine-scanner-theme')).toBeNull();
  });

  it('marks onboarding complete when the library already has books', async () => {
    useProfileStore.setState({ preferences: { ...DEFAULT_PREFERENCES, onboardingCompleted: false } });
    useBookStore.setState({ books: [makeBook()], shelves: [] });
    renderApp('/home');
    await waitFor(() => {
      expect(useProfileStore.getState().preferences.onboardingCompleted).toBe(true);
    });
  });

  it('shows onboarding for an empty library and completes it', async () => {
    useProfileStore.setState({ preferences: { ...DEFAULT_PREFERENCES, onboardingCompleted: false } });
    renderApp('/home');
    expect(await screen.findByRole('dialog', { name: /welcome tour/i })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /skip tour/i })[0]);
    await waitFor(() => {
      expect(useProfileStore.getState().preferences.onboardingCompleted).toBe(true);
    });
  });

  it('shows the password-recovery overlay and can dismiss it', async () => {
    useAuthStore.setState({ recoveryMode: true });
    renderApp('/home');
    expect(await screen.findByTestId('mock-password-reset')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'finish-recovery' }));
    await waitFor(() => {
      expect(useAuthStore.getState().recoveryMode).toBe(false);
    });
  });

  it('announces header quick-nav clicks and preloads on hover', async () => {
    renderApp('/home');
    fireEvent.mouseEnter(screen.getByRole('link', { name: 'Book library' }));
    fireEvent.mouseEnter(screen.getAllByRole('link', { name: 'Add books' })[0]);
    fireEvent.focus(screen.getAllByRole('link', { name: 'Profile' })[0]);
    fireEvent.click(screen.getAllByRole('link', { name: 'Profile' })[0]);
    expect(await screen.findByTestId('mock-profile')).toBeInTheDocument();
  });

  it('preloads routes from bottom-nav hover and focus', async () => {
    renderApp('/home');
    const home = screen.getByTestId(uiContracts.navTabTestId('home'));
    const scan = screen.getByTestId(uiContracts.navTabTestId('scan'));
    const library = screen.getByTestId(uiContracts.navTabTestId('library'));
    const profile = screen.getByTestId(uiContracts.navTabTestId('profile'));
    fireEvent.mouseEnter(home);
    fireEvent.mouseEnter(scan);
    fireEvent.mouseEnter(library);
    fireEvent.mouseEnter(profile);
    fireEvent.focus(home);
    fireEvent.focus(scan);
    fireEvent.focus(library);
    fireEvent.focus(profile);
    fireEvent.click(scan);
    expect(await screen.findByTestId('mock-scanner')).toBeInTheDocument();
  });

  it('loads preferences from the cloud and marks dirty after a local change', async () => {
    mergeSync.mockResolvedValue({ books: [makeBook()], shelves: [] });
    const loadFromCloud = vi.fn().mockResolvedValue(undefined);
    useProfileStore.setState({ loadFromCloud });
    useAuthStore.setState({ user: fakeUser as never });
    renderApp('/home');
    await waitFor(() => {
      expect(loadFromCloud).toHaveBeenCalledWith('user-1');
    });
    await waitFor(() => {
      expect(useBookStore.getState().books[0]?.title).toBe('1984');
    });
    useBookStore.getState().addBook(makeBook({ id: 'book-2', isbn: '9780544003415', title: 'New' }));
    await waitFor(() => {
      expect(useSyncQueue.getState().pendingChanges).toBeGreaterThan(0);
    });
  });

  it('sets document title for public and app routes', async () => {
    renderApp('/about');
    await waitFor(() => {
      expect(document.title).toMatch(/About SpineScanner/);
    });
  });

  it('shows marketing hero stats for an empty library and offline sync copy', async () => {
    onlineState.online = false;
    useSyncQueue.setState({ pendingChanges: 1, lastSyncedAt: null });
    renderApp('/scan');
    expect(await screen.findByText('Offline')).toBeInTheDocument();
    expect(screen.getByText('1 change to sync')).toBeInTheDocument();
    expect(screen.getByText('Nothing pinned yet')).toBeInTheDocument();
  });

  it('shows plural pending-change copy on the marketing hero', async () => {
    useSyncQueue.setState({ pendingChanges: 4, lastSyncedAt: null });
    renderApp('/scan');
    expect(await screen.findByText('4 changes to sync')).toBeInTheDocument();
  });

  it('shows last-synced copy on the marketing hero when everything is clean', async () => {
    useSyncQueue.setState({ pendingChanges: 0, lastSyncedAt: new Date().toISOString() });
    renderApp('/scan');
    expect(await screen.findByText(/Synced /)).toBeInTheDocument();
  });

  it('shows currently-reading stats when a book is in progress', async () => {
    useBookStore.setState({
      books: [makeBook({ status: 'reading', title: 'Dune', author: 'Frank Herbert' })],
      shelves: [],
    });
    renderApp('/scan');
    expect(await screen.findByText('Dune')).toBeInTheDocument();
    expect(screen.getByText('Frank Herbert')).toBeInTheDocument();
  });

  it('syncs a newly added book when signed in and online', async () => {
    useProfileStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, onboardingCompleted: true, batchModeDefault: true },
    });
    useAuthStore.setState({ user: fakeUser as never });
    renderApp('/scan');
    await screen.findByTestId('mock-scanner');
    fireEvent.click(screen.getByRole('button', { name: 'scan-valid' }));
    await waitFor(() => {
      expect(pushBooks).toHaveBeenCalled();
    });
  });

  it('warns when pushBooks fails after a normal add', async () => {
    useProfileStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, onboardingCompleted: true, batchModeDefault: true },
    });
    useAuthStore.setState({ user: fakeUser as never });
    pushBooks.mockRejectedValueOnce(new Error('nope'));
    renderApp('/scan');
    await screen.findByTestId('mock-scanner');
    fireEvent.click(screen.getByRole('button', { name: 'scan-valid' }));
    expect(await screen.findByText('Cloud sync failed. Changes saved locally.')).toBeInTheDocument();
  });

  it('renders a custom ErrorBoundary fallback when a child throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onError = vi.fn();
    const Boom = () => {
      throw new Error('render boom');
    };
    render(
      <ErrorBoundary fallback={<div>custom fallback</div>} onError={onError}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('custom fallback')).toBeInTheDocument();
    expect(onError).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('shows the default ErrorBoundary UI and retries a non-chunk error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let shouldThrow = true;
    const Flaky = () => {
      if (shouldThrow) throw new Error('transient');
      return <div>recovered</div>;
    };
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('recovered')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('skips the duplicate warning when the preference is off', async () => {
    useBookStore.setState({ books: [makeBook()], shelves: [] });
    useProfileStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, onboardingCompleted: true, warnOnDuplicateIsbn: false, batchModeDefault: true },
    });
    renderApp('/scan');
    await screen.findByTestId('mock-scanner');
    fireEvent.click(screen.getByRole('button', { name: 'scan-valid' }));
    await waitFor(() => {
      expect(useBookStore.getState().books.length).toBeGreaterThan(1);
    });
  });
});
