import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowUpDown,
  BarChart3,
  BookOpen,
  BookmarkPlus,
  CheckCircle,
  CheckSquare,
  Clock,
  Filter,
  Inbox,
  LayoutGrid,
  LibraryBig,
  List,
  Columns2,
  RotateCcw,
  ScanLine,
  Search,
  Layers,
  Settings,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
  XCircle,
} from 'lucide-react';
import { useBookStore } from '../store/useBookStore.ts';
import { useProfileStore } from '../store/useProfileStore.ts';
import type { BookEntry, SavedView, SmartShelf } from '../types.ts';
import { SHELF_COLORS } from '../types.ts';
import BookCard from './BookCard.tsx';
import BookDetail from './BookDetail.tsx';
import ShelfManager from './ShelfManager.tsx';
import { useToast } from './Toast.tsx';
import { getReadingProgressPercent } from '../utils/bookState.ts';
import { getBookCoverSrc, getLibraryInsights } from '../utils/bookPresentation.ts';
import s from './LibraryList.module.css';

type SortField = 'title' | 'author' | 'dateAdded' | 'pageCount';
type StatusFilter = BookEntry['status'] | 'all';
type ViewMode = 'grid' | 'list' | 'masonry';
type LibrarySegment = 'foryou' | 'shelves' | 'all';

interface LibraryListProps {
  onStartScanning?: () => void;
  initialOpenIsbn?: string | null;
  onOpenComplete?: () => void;
}

function createId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function bookMatchesSmartShelf(book: BookEntry, smartShelf: SmartShelf): boolean {
  const searchTerm = smartShelf.searchTerm?.trim().toLowerCase() ?? '';
  const matchesSearch = !searchTerm
    || book.title.toLowerCase().includes(searchTerm)
    || book.author.toLowerCase().includes(searchTerm)
    || book.isbn.includes(searchTerm);
  const matchesStatus = !smartShelf.statusFilter || smartShelf.statusFilter === 'all' || book.status === smartShelf.statusFilter;
  const matchesReview = !smartShelf.reviewOnly || book.needsReview === true;
  const matchesMin = smartShelf.minPageCount == null || (book.pageCount || 0) >= smartShelf.minPageCount;
  const matchesMax = smartShelf.maxPageCount == null || (book.pageCount || 0) <= smartShelf.maxPageCount;
  return matchesSearch && matchesStatus && matchesReview && matchesMin && matchesMax;
}

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string; icon: React.ReactNode }> = [
  { value: 'all', label: 'All', icon: <LibraryBig size={14} /> },
  { value: 'to-read', label: 'To Read', icon: <Clock size={14} /> },
  { value: 'reading', label: 'Reading', icon: <BookOpen size={14} /> },
  { value: 'read', label: 'Read', icon: <CheckCircle size={14} /> },
  { value: 'dnf', label: 'DNF', icon: <XCircle size={14} /> },
];

const SORT_OPTIONS: Array<{ value: SortField; label: string }> = [
  { value: 'dateAdded', label: 'Recently added' },
  { value: 'title', label: 'Title' },
  { value: 'author', label: 'Author' },
  { value: 'pageCount', label: 'Page count' },
];

export default function LibraryList({ onStartScanning, initialOpenIsbn, onOpenComplete }: LibraryListProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    books,
    shelves,
    updateBookStatus,
    markNeedsReview,
    bulkUpdateStatus,
    bulkAssignShelf,
    bulkRemoveBooks,
    bulkUpdateBooks,
  } = useBookStore();
  const { preferences, updatePreferences } = useProfileStore();
  const { toast, confirm } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [shelfFilter, setShelfFilter] = useState<string | null>(null);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [seriesFilter, setSeriesFilter] = useState<string | null>(null);
  const [minPages, setMinPages] = useState('');
  const [maxPages, setMaxPages] = useState('');
  const [selectedBook, setSelectedBook] = useState<BookEntry | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkShelfId, setBulkShelfId] = useState('');
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(null);
  const [activeSmartShelfId, setActiveSmartShelfId] = useState<string | null>(null);
  const [showSaveViewForm, setShowSaveViewForm] = useState(false);
  const [showSmartShelfForm, setShowSmartShelfForm] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [newSmartShelfName, setNewSmartShelfName] = useState('');
  const [librarySegment, setLibrarySegment] = useState<LibrarySegment>('foryou');
  const [librarySessionReturn] = useState(() => {
    try {
      return sessionStorage.getItem('spine-library-session') === '1';
    } catch {
      return false;
    }
  });

  const sortBy = preferences.librarySortBy;
  const sortAsc = preferences.librarySortAsc;
  const statusFilter = preferences.libraryStatusFilter;
  const viewMode = preferences.libraryViewMode;
  const showStats = preferences.showStatsDefault;
  const showShelves = preferences.showShelvesDefault;
  const smartShelves = preferences.smartShelves;
  const savedViews = preferences.savedViews;

  const setSortBy = useCallback((value: SortField) => updatePreferences({ librarySortBy: value }), [updatePreferences]);
  const setSortAsc = useCallback((value: boolean) => updatePreferences({ librarySortAsc: value }), [updatePreferences]);
  const setStatusFilter = useCallback((value: StatusFilter) => updatePreferences({ libraryStatusFilter: value }), [updatePreferences]);
  const setViewMode = useCallback((value: ViewMode) => updatePreferences({ libraryViewMode: value }), [updatePreferences]);
  const setShowStats = useCallback((value: boolean) => updatePreferences({ showStatsDefault: value }), [updatePreferences]);
  const setShowShelves = useCallback((value: boolean) => updatePreferences({ showShelvesDefault: value }), [updatePreferences]);

  useEffect(() => {
    try {
      sessionStorage.setItem('spine-library-session', '1');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (searchParams.get('review') !== '1') return;
    setReviewOnly(true);
    const next = new URLSearchParams(searchParams);
    next.delete('review');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (librarySegment === 'shelves') {
      setShowShelves(true);
    }
  }, [librarySegment, setShowShelves]);

  const resetActivePresets = useCallback(() => {
    setActiveSavedViewId(null);
    setActiveSmartShelfId(null);
  }, []);

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setShelfFilter(null);
    setReviewOnly(false);
    setSeriesFilter(null);
    setMinPages('');
    setMaxPages('');
    setStatusFilter('all');
    resetActivePresets();
  }, [resetActivePresets, setStatusFilter]);

  const seriesNames = useMemo(() => {
    const set = new Set<string>();
    for (const book of books) {
      const name = book.seriesName?.trim();
      if (name) set.add(name);
    }
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [books]);

  const insights = useMemo(() => getLibraryInsights(books), [books]);
  const reviewBooks = useMemo(
    () => books.filter((book) => book.needsReview).sort((a, b) => Date.parse(b.dateAdded) - Date.parse(a.dateAdded)),
    [books]
  );

  const filteredAndSorted = useMemo(() => {
    const forYou = librarySegment === 'foryou';
    const effectiveSortBy = forYou ? 'dateAdded' : sortBy;
    const effectiveSortAsc = forYou ? false : sortAsc;
    const loweredSearch = searchTerm.trim().toLowerCase();
    const minPageValue = minPages.trim() ? parseInt(minPages, 10) : null;
    const maxPageValue = maxPages.trim() ? parseInt(maxPages, 10) : null;

    return [...books]
      .filter((book) => {
        const matchesSearch = !loweredSearch
          || book.title.toLowerCase().includes(loweredSearch)
          || book.author.toLowerCase().includes(loweredSearch)
          || book.isbn.includes(loweredSearch);
        const matchesStatus = statusFilter === 'all' || book.status === statusFilter;
        const matchesShelf = !shelfFilter || (book.shelfIds || []).includes(shelfFilter);
        const matchesReview = !reviewOnly || book.needsReview === true;
        const matchesMin = minPageValue == null || (book.pageCount || 0) >= minPageValue;
        const matchesMax = maxPageValue == null || (book.pageCount || 0) <= maxPageValue;
        const matchesSeries = !seriesFilter || (book.seriesName?.trim() === seriesFilter);
        return matchesSearch && matchesStatus && matchesShelf && matchesReview && matchesMin && matchesMax && matchesSeries;
      })
      .sort((a, b) => {
        let cmp = 0;
        switch (effectiveSortBy) {
          case 'title':
            cmp = a.title.localeCompare(b.title);
            break;
          case 'author':
            cmp = a.author.localeCompare(b.author);
            break;
          case 'dateAdded':
            cmp = a.dateAdded.localeCompare(b.dateAdded);
            break;
          case 'pageCount':
            cmp = (a.pageCount || 0) - (b.pageCount || 0);
            break;
        }
        return effectiveSortAsc ? cmp : -cmp;
      });
  }, [books, searchTerm, statusFilter, shelfFilter, reviewOnly, seriesFilter, minPages, maxPages, sortBy, sortAsc, librarySegment]);

  const selectedShelf = shelves.find((shelf) => shelf.id === shelfFilter) ?? null;
  const filterChips = useMemo(() => {
    const chips: { id: string; label: string; onRemove: () => void }[] = [];
    const trimmedSearch = searchTerm.trim();
    if (trimmedSearch) {
      chips.push({ id: 'search', label: `Search: ${trimmedSearch}`, onRemove: () => setSearchTerm('') });
    }
    if (statusFilter !== 'all') {
      chips.push({
        id: 'status',
        label: `Status: ${statusFilter.replace('-', ' ')}`,
        onRemove: () => setStatusFilter('all'),
      });
    }
    if (selectedShelf) {
      chips.push({
        id: 'shelf',
        label: `Shelf: ${selectedShelf.name}`,
        onRemove: () => setShelfFilter(null),
      });
    }
    if (reviewOnly) {
      chips.push({ id: 'review', label: 'Needs review', onRemove: () => setReviewOnly(false) });
    }
    if (seriesFilter) {
      chips.push({
        id: 'series',
        label: `Series: ${seriesFilter}`,
        onRemove: () => setSeriesFilter(null),
      });
    }
    if (minPages.trim()) {
      chips.push({
        id: 'minPages',
        label: `Min pages: ${minPages.trim()}`,
        onRemove: () => setMinPages(''),
      });
    }
    if (maxPages.trim()) {
      chips.push({
        id: 'maxPages',
        label: `Max pages: ${maxPages.trim()}`,
        onRemove: () => setMaxPages(''),
      });
    }
    return chips;
  }, [searchTerm, statusFilter, selectedShelf, reviewOnly, seriesFilter, minPages, maxPages]);

  const listParentRef = useRef<HTMLDivElement>(null);
  const gridParentRef = useRef<HTMLDivElement>(null);
  const [gridColumns, setGridColumns] = useState(3);
  const gridColumnWidth = 220;
  const effectiveGridColumns = viewMode === 'masonry' ? 2 : gridColumns;

  useEffect(() => {
    const container = gridParentRef.current;
    if (!container || (viewMode !== 'grid' && viewMode !== 'masonry') || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    if (viewMode === 'masonry') return undefined;

    const observer = new ResizeObserver(([entry]) => {
      const cols = Math.max(1, Math.floor(entry.contentRect.width / gridColumnWidth));
      setGridColumns(cols);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [viewMode]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: filteredAndSorted.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 110,
    overscan: 8,
  });

  const gridRowCount = Math.ceil(filteredAndSorted.length / effectiveGridColumns);
  const gridVirtualizer = useVirtualizer({
    count: gridRowCount,
    getScrollElement: () => gridParentRef.current,
    estimateSize: () => (viewMode === 'masonry' ? 400 : 350),
    overscan: 4,
  });

  useEffect(() => {
    if (!initialOpenIsbn) return;
    const book = books.find((entry) => entry.isbn === initialOpenIsbn);
    if (book) setSelectedBook(book);
    onOpenComplete?.();
  }, [initialOpenIsbn, books, onOpenComplete]);

  useEffect(() => {
    if (!selectionMode) {
      setSelectedIds([]);
    }
  }, [selectionMode]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => books.some((book) => book.id === id)));
  }, [books]);

  const freshSelectedBook = selectedBook
    ? books.find((entry) => entry.id === selectedBook.id) ?? null
    : null;

  const emptyLibrary = books.length === 0;
  const emptyFilteredResults = !emptyLibrary && filteredAndSorted.length === 0;

  const toggleBookSelection = useCallback((bookId: string) => {
    setSelectedIds((current) => (
      current.includes(bookId)
        ? current.filter((id) => id !== bookId)
        : [...current, bookId]
    ));
  }, []);

  const toggleVisibleSelection = useCallback(() => {
    const visibleIds = filteredAndSorted.map((book) => book.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((current) => (
      allVisibleSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...current, ...visibleIds]))
    ));
  }, [filteredAndSorted, selectedIds]);

  const handleBookOpen = useCallback((book: BookEntry) => {
    if (selectionMode) {
      toggleBookSelection(book.id);
      return;
    }
    setSelectedBook(book);
  }, [selectionMode, toggleBookSelection]);

  /** Stable ref for virtualized grid cards — avoids new `onClick` per row (memo-friendly). */
  const openBookById = useCallback((id: string) => {
    const book = useBookStore.getState().books.find((b) => b.id === id);
    if (!book) return;
    handleBookOpen(book);
  }, [handleBookOpen]);

  const applySavedView = useCallback((view: SavedView) => {
    setSearchTerm(view.searchTerm);
    setShelfFilter(view.shelfId ?? null);
    setStatusFilter(view.statusFilter);
    setSortBy(view.sortBy);
    setSortAsc(view.sortAsc);
    setReviewOnly(view.reviewOnly ?? false);
    setMinPages(view.minPageCount == null ? '' : String(view.minPageCount));
    setMaxPages(view.maxPageCount == null ? '' : String(view.maxPageCount));
    setActiveSavedViewId(view.id);
    setActiveSmartShelfId(view.smartShelfId ?? null);
  }, [setSortAsc, setSortBy, setStatusFilter]);

  const applySmartShelf = useCallback((smartShelf: SmartShelf) => {
    setSearchTerm(smartShelf.searchTerm ?? '');
    setStatusFilter(smartShelf.statusFilter ?? 'all');
    setReviewOnly(Boolean(smartShelf.reviewOnly));
    setMinPages(smartShelf.minPageCount == null ? '' : String(smartShelf.minPageCount));
    setMaxPages(smartShelf.maxPageCount == null ? '' : String(smartShelf.maxPageCount));
    setShelfFilter(null);
    setActiveSmartShelfId(smartShelf.id);
    setActiveSavedViewId(null);
  }, [setStatusFilter]);

  const saveCurrentView = useCallback(() => {
    const trimmedName = newViewName.trim();
    if (!trimmedName) {
      toast('Name this saved view before saving.', 'warning');
      return;
    }

    const nextView: SavedView = {
      id: createId(),
      name: trimmedName,
      searchTerm,
      statusFilter,
      shelfId: shelfFilter,
      sortBy,
      sortAsc,
      smartShelfId: activeSmartShelfId,
      reviewOnly,
      minPageCount: minPages.trim() ? parseInt(minPages, 10) : null,
      maxPageCount: maxPages.trim() ? parseInt(maxPages, 10) : null,
    };

    updatePreferences({ savedViews: [...savedViews, nextView] });
    setActiveSavedViewId(nextView.id);
    setShowSaveViewForm(false);
    setNewViewName('');
    toast(`Saved "${trimmedName}"`, 'success');
  }, [
    activeSmartShelfId,
    maxPages,
    minPages,
    newViewName,
    reviewOnly,
    savedViews,
    searchTerm,
    shelfFilter,
    sortAsc,
    sortBy,
    statusFilter,
    toast,
    updatePreferences,
  ]);

  const saveCurrentSmartShelf = useCallback(() => {
    const trimmedName = newSmartShelfName.trim();
    if (!trimmedName) {
      toast('Name this smart shelf before saving.', 'warning');
      return;
    }

    const nextShelf: SmartShelf = {
      id: createId(),
      name: trimmedName,
      color: SHELF_COLORS[smartShelves.length % SHELF_COLORS.length],
      searchTerm,
      statusFilter,
      reviewOnly,
      minPageCount: minPages.trim() ? parseInt(minPages, 10) : null,
      maxPageCount: maxPages.trim() ? parseInt(maxPages, 10) : null,
    };

    updatePreferences({ smartShelves: [...smartShelves, nextShelf] });
    setActiveSmartShelfId(nextShelf.id);
    setActiveSavedViewId(null);
    setShowSmartShelfForm(false);
    setNewSmartShelfName('');
    toast(`Smart shelf "${trimmedName}" created`, 'success');
  }, [
    maxPages,
    minPages,
    newSmartShelfName,
    reviewOnly,
    searchTerm,
    smartShelves,
    statusFilter,
    toast,
    updatePreferences,
  ]);

  const removeSavedView = useCallback((viewId: string) => {
    updatePreferences({ savedViews: savedViews.filter((view) => view.id !== viewId) });
    if (activeSavedViewId === viewId) {
      setActiveSavedViewId(null);
    }
  }, [activeSavedViewId, savedViews, updatePreferences]);

  const removeSmartShelf = useCallback((smartShelfId: string) => {
    updatePreferences({
      smartShelves: smartShelves.filter((smartShelf) => smartShelf.id !== smartShelfId),
      savedViews: savedViews.map((view) => (
        view.smartShelfId === smartShelfId
          ? { ...view, smartShelfId: null }
          : view
      )),
    });
    if (activeSmartShelfId === smartShelfId) {
      setActiveSmartShelfId(null);
    }
  }, [activeSmartShelfId, savedViews, smartShelves, updatePreferences]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.length === 0) return;
    const yes = await confirm({
      title: 'Delete selected books',
      message: `Remove ${selectedIds.length} selected book${selectedIds.length > 1 ? 's' : ''} from your library?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!yes) return;

    bulkRemoveBooks(selectedIds);
    setSelectedIds([]);
    setSelectionMode(false);
    toast('Selected books removed', 'info');
  }, [bulkRemoveBooks, confirm, selectedIds, toast]);

  const handleBulkStatus = useCallback((nextStatus: BookEntry['status']) => {
    if (selectedIds.length === 0) return;
    bulkUpdateStatus(selectedIds, nextStatus);
    toast(`Updated ${selectedIds.length} book${selectedIds.length > 1 ? 's' : ''}`, 'success');
  }, [bulkUpdateStatus, selectedIds, toast]);

  const handleBulkResolveReview = useCallback(() => {
    if (selectedIds.length === 0) return;
    bulkUpdateBooks(selectedIds, { needsReview: false, reviewReason: '' });
    toast('Resolved review flags for selected books', 'success');
  }, [bulkUpdateBooks, selectedIds, toast]);

  const handleBulkAssignShelf = useCallback(() => {
    if (!bulkShelfId || selectedIds.length === 0) return;
    bulkAssignShelf(selectedIds, bulkShelfId);
    const shelf = shelves.find((entry) => entry.id === bulkShelfId);
    toast(`Added selected books to ${shelf?.name ?? 'shelf'}`, 'success');
    setBulkShelfId('');
  }, [bulkAssignShelf, bulkShelfId, selectedIds, shelves, toast]);

  return (
    <section className={s.container}>
      {!emptyLibrary && (
        <div className={s.segmentBar} role="tablist" aria-label="Library scope">
          {(['foryou', 'shelves', 'all'] as const).map((seg) => (
            <button
              key={seg}
              type="button"
              role="tab"
              aria-selected={librarySegment === seg}
              className={`glass ${s.segmentBtn} ${librarySegment === seg ? s.segmentBtnActive : ''}`}
              onClick={() => setLibrarySegment(seg)}
            >
              {seg === 'foryou' ? 'For you' : seg === 'shelves' ? 'Shelves' : 'All books'}
            </button>
          ))}
        </div>
      )}

      {librarySegment === 'foryou' && !emptyLibrary && (
        <p className={s.segmentHint}>
          Newest titles first. Use{' '}
          <button type="button" className={s.segmentLink} onClick={() => setLibrarySegment('all')}>
            All books
          </button>
          {' '}for saved views, smart shelves, and every sort option.
        </p>
      )}

      <div className={`glass ${s.hero} ${librarySessionReturn ? s.heroCompact : ''}`}>
        <div className={s.heroCopy}>
          <span className={s.eyebrow}>
            <Sparkles size={14} />
            Library workspace
          </span>
          <h1 className={s.title}>Your library, built for browsing not digging.</h1>
          <p className={s.heroText}>Build a library that feels easy to use</p>
          <p className={s.resultsSummary}>Scan fast, review edge cases later, and keep your shelves tidy without losing momentum.</p>
          <div className={s.heroActions}>
            <button type="button" className={`glass ${s.primaryAction}`} onClick={onStartScanning}>
              <ScanLine size={16} />
              {books.length === 0 ? 'Start scanning' : 'Scan another book'}
            </button>
            <button
              type="button"
              className={`glass ${s.secondaryAction}`}
              onClick={() => setShowStats(!showStats)}
            >
              <BarChart3 size={16} />
              {showStats ? 'Hide stats' : 'Show stats'}
            </button>
            <button
              type="button"
              className={`glass ${s.secondaryAction}`}
              onClick={() => setShowShelves(!showShelves)}
            >
              <BookmarkPlus size={16} />
              {showShelves ? 'Hide shelves' : 'Show shelves'}
            </button>
          </div>
        </div>

        <div className={s.highlightGrid}>
          <button type="button" className={`glass ${s.highlightCard} ${s.highlightCardCta}`} onClick={() => setReviewOnly(true)}>
            <span className={s.highlightLabel}>Needs review</span>
            <strong>{insights.reviewCount}</strong>
            <span>{insights.reviewCount === 1 ? 'Book' : 'Books'} waiting for cleanup</span>
          </button>
          <button
            type="button"
            className={`glass ${s.highlightCard} ${s.highlightCardCta}`}
            onClick={() => setStatusFilter('reading')}
          >
            <span className={s.highlightLabel}>Currently reading</span>
            <strong>{insights.readingCount}</strong>
            <span>{insights.currentlyReading?.title ?? 'Nothing in progress yet'}</span>
          </button>
          <div className={`glass ${s.highlightCard}`}>
            <span className={s.highlightLabel}>Completion rate</span>
            <strong>{insights.completionRate}%</strong>
            <span>{insights.totalBooks} books in your library</span>
          </div>
          <div className={`glass ${s.highlightCard}`}>
            <span className={s.highlightLabel}>Finished this year</span>
            <strong>{insights.finishedThisYear}</strong>
            <span>
              Mark books as read with a finish date to track {new Date().getFullYear()} progress.
            </span>
          </div>
        </div>
      </div>

      {showStats && (
        <div className={`glass ${s.stats}`}>
          <div className={s.statItem}>
            <div className={s.statValue}>{insights.totalBooks}</div>
            <div className={s.statLabel}>Total Books</div>
          </div>
          <div className={s.statItem}>
            <div className={s.statValue}>{insights.pagesRead}</div>
            <div className={s.statLabel}>Pages Read</div>
          </div>
          <div className={s.statItem}>
            <div className={s.statValue}>{insights.toReadCount}</div>
            <div className={s.statLabel}>To Read</div>
          </div>
          <div className={s.statItem}>
            <div className={s.statValue}>{insights.readingCount}</div>
            <div className={s.statLabel}>Reading</div>
          </div>
          <div className={s.statItem}>
            <div className={s.statValue}>{insights.readCount}</div>
            <div className={s.statLabel}>Finished</div>
          </div>
          <div className={s.statItem}>
            <div className={s.statValue}>{insights.finishedThisYear}</div>
            <div className={s.statLabel}>Finished {new Date().getFullYear()}</div>
          </div>
        </div>
      )}

      {showShelves && <ShelfManager />}

      {!emptyLibrary && filterChips.length === 0 && insights.recentlyAdded.length > 0 && (
        <div className={s.recentSection}>
          <div className={s.recentHeader}>
            <div>
              <span className={s.sectionLabel}>
                <Clock size={14} />
                Recently added
              </span>
              <p className={s.recentHint}>Jump back into the books you just scanned.</p>
            </div>
          </div>
          <div className={s.recentGrid}>
            {insights.recentlyAdded.map((book) => (
              <button
                key={book.id}
                type="button"
                className={`glass ${s.recentCard}`}
                onClick={() => setSelectedBook(book)}
              >
                <img
                  src={getBookCoverSrc(book.coverImg)}
                  alt={book.title}
                  className={s.recentCover}
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                />
                <div className={s.recentMeta}>
                  <strong>{book.title}</strong>
                  <span>{book.author}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {!emptyLibrary && reviewBooks.length > 0 && (
        <div className={s.reviewSection}>
          <div className={s.recentHeader}>
            <div>
              <span className={s.sectionLabel}>
                <Inbox size={14} />
                Needs review
              </span>
              <p className={s.recentHint}>Keep scanning now and clean up the tricky ones when you have a minute.</p>
            </div>
          </div>
          <div className={s.reviewGrid}>
            {reviewBooks.slice(0, 4).map((book) => (
              <div key={book.id} className={`glass ${s.reviewCard}`}>
                <div className={s.reviewMeta}>
                  <strong>{book.title}</strong>
                  <span>{book.author}</span>
                  <span>{book.reviewReason || 'Metadata needs a quick look.'}</span>
                </div>
                <div className={s.headerActions}>
                  <button type="button" className={`glass ${s.clearBtn}`} onClick={() => setSelectedBook(book)}>
                    Review
                  </button>
                  <button
                    type="button"
                    className={`glass ${s.secondaryAction}`}
                    onClick={() => markNeedsReview(book.id, false)}
                  >
                    Resolve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={s.header}>
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {!emptyLibrary &&
            `${filteredAndSorted.length} book${filteredAndSorted.length === 1 ? '' : 's'} match your filters.`}
        </div>
        <div>
          <span className={s.sectionLabel}>
            <LibraryBig size={14} />
            Library explorer
          </span>
          <h2 className={s.heading}>{filteredAndSorted.length} books ready to browse</h2>
          <p className={s.resultsSummary}>Tune the view, save the filters you reuse, and tidy batches in one place.</p>
        </div>
        <div className={s.headerActions}>
          <button
            type="button"
            className={`glass ${s.iconBtn}`}
            onClick={() => setSelectionMode(!selectionMode)}
            aria-pressed={selectionMode}
          >
            <CheckSquare size={16} />
            {selectionMode ? 'Done selecting' : 'Select books'}
          </button>
          <button
            type="button"
            className={`glass ${s.manageBtn}`}
            onClick={() => navigate('/data')}
            aria-label="Import and export library data"
          >
            <Settings size={16} />
            Import & export
          </button>
        </div>
      </div>

      {!emptyLibrary && (
        <>
          {librarySegment !== 'foryou' && (
          <div className={s.savedTools}>
            <div className={s.presetGroup}>
              <div className={s.recentHeader}>
                <span className={s.sectionLabel}>
                  <BookmarkPlus size={14} />
                  Saved views
                </span>
                <button type="button" className={`glass ${s.clearBtn}`} onClick={() => setShowSaveViewForm(!showSaveViewForm)}>
                  {showSaveViewForm ? 'Cancel' : 'Save current view'}
                </button>
              </div>
              {showSaveViewForm && (
                <div className={`glass ${s.inlineForm}`}>
                  <input
                    className={s.inlineInput}
                    type="text"
                    value={newViewName}
                    onChange={(event) => setNewViewName(event.target.value)}
                    placeholder="Weekend browsing"
                    aria-label="Saved view name"
                  />
                  <button type="button" className={`glass ${s.secondaryAction}`} onClick={saveCurrentView}>
                    Save view
                  </button>
                </div>
              )}
              <div className={s.presetRow}>
                {savedViews.length === 0 && <span className={s.filterCount}>No saved views yet.</span>}
                {savedViews.map((view) => (
                  <div key={view.id} className={s.cardWrap}>
                    <button
                      type="button"
                      className={`glass ${s.presetChip} ${activeSavedViewId === view.id ? s.presetChipActive : ''}`}
                      onClick={() => applySavedView(view)}
                    >
                      {view.name}
                    </button>
                    <button
                      type="button"
                      className={s.chipRemove}
                      onClick={() => removeSavedView(view.id)}
                      aria-label={`Delete ${view.name}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className={s.presetGroup}>
              <div className={s.recentHeader}>
                <span className={s.sectionLabel}>
                  <WandSparkles size={14} />
                  Smart shelves
                </span>
                <button type="button" className={`glass ${s.clearBtn}`} onClick={() => setShowSmartShelfForm(!showSmartShelfForm)}>
                  {showSmartShelfForm ? 'Cancel' : 'Create smart shelf'}
                </button>
              </div>
              {showSmartShelfForm && (
                <div className={`glass ${s.inlineForm}`}>
                  <input
                    className={s.inlineInput}
                    type="text"
                    value={newSmartShelfName}
                    onChange={(event) => setNewSmartShelfName(event.target.value)}
                    placeholder="Long reads to finish"
                    aria-label="Smart shelf name"
                  />
                  <button type="button" className={`glass ${s.secondaryAction}`} onClick={saveCurrentSmartShelf}>
                    Create shelf
                  </button>
                </div>
              )}
              <div className={s.presetRow}>
                {smartShelves.length === 0 && <span className={s.filterCount}>No smart shelves yet.</span>}
                {smartShelves.map((smartShelf) => {
                  const matches = books.filter((book) => bookMatchesSmartShelf(book, smartShelf)).length;
                  return (
                    <div key={smartShelf.id} className={s.cardWrap}>
                      <button
                        type="button"
                        className={`glass ${s.presetChip} ${activeSmartShelfId === smartShelf.id ? s.presetChipActive : ''}`}
                        style={{ borderColor: `${smartShelf.color}55` }}
                        onClick={() => applySmartShelf(smartShelf)}
                      >
                        {smartShelf.name} · {matches}
                      </button>
                      <button
                        type="button"
                        className={s.chipRemove}
                        onClick={() => removeSmartShelf(smartShelf.id)}
                        aria-label={`Delete ${smartShelf.name}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          )}

          <div className={s.searchRow}>
            <label className={s.searchWrap}>
              <Search size={16} className={s.searchIcon} />
              <span className="sr-only">Search library</span>
              <input
                type="search"
                aria-label="Search library"
                className={`${s.searchInput} glass`}
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  resetActivePresets();
                }}
                placeholder="Search title, author, or ISBN"
              />
            </label>
            <button type="button" className={`glass ${s.clearBtn}`} onClick={clearFilters}>
              <RotateCcw size={16} />
              Clear filters
            </button>
          </div>

          {filterChips.length > 0 && (
            <div className={s.activeFilters}>
              {filterChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={`glass ${s.activeFilterChip}`}
                  onClick={chip.onRemove}
                  aria-label={`Remove filter: ${chip.label}`}
                >
                  <span>{chip.label}</span>
                  <X size={14} className={s.chipDismissIcon} aria-hidden />
                </button>
              ))}
            </div>
          )}

          <div className={s.filterRow}>
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`glass ${s.filterBtn} ${statusFilter === option.value ? s.viewBtnActive : ''}`}
                onClick={() => {
                  setStatusFilter(option.value);
                  resetActivePresets();
                }}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
            <button
              type="button"
              className={`glass ${s.filterBtn} ${reviewOnly ? s.viewBtnActive : ''}`}
              aria-pressed={reviewOnly}
              onClick={() => {
                setReviewOnly(!reviewOnly);
                resetActivePresets();
              }}
            >
              <Inbox size={14} />
              Needs review
            </button>
            {seriesNames.length > 0 && (
              <label className={`glass ${s.filterBtn}`} style={{ padding: '0.35rem 0.65rem', gap: '0.35rem' }}>
                <Layers size={14} aria-hidden />
                <span className="sr-only">Filter by series</span>
                <select
                  className={s.seriesSelect}
                  aria-label="Filter by series"
                  value={seriesFilter ?? ''}
                  onChange={(event) => {
                    const v = event.target.value;
                    setSeriesFilter(v === '' ? null : v);
                    resetActivePresets();
                  }}
                >
                  <option value="">All series</option>
                  {seriesNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {shelves.length > 0 && (
              <>
                <button
                  type="button"
                  className={`glass ${s.filterBtn} ${!shelfFilter ? s.viewBtnActive : ''}`}
                  onClick={() => {
                    setShelfFilter(null);
                    resetActivePresets();
                  }}
                >
                  All Shelves
                </button>
                {shelves.map((shelf) => (
                  <button
                    key={shelf.id}
                    type="button"
                    className={`glass ${s.filterBtn} ${shelfFilter === shelf.id ? s.viewBtnActive : ''}`}
                    onClick={() => {
                      setShelfFilter(shelf.id);
                      resetActivePresets();
                    }}
                  >
                    {shelf.name}
                  </button>
                ))}
              </>
            )}
            <input
              type="number"
              min="0"
              value={minPages}
              onChange={(event) => {
                setMinPages(event.target.value);
                resetActivePresets();
              }}
              className={`${s.pageFilterInput} glass`}
              placeholder="Min pages"
              aria-label="Minimum page count"
            />
            <input
              type="number"
              min="0"
              value={maxPages}
              onChange={(event) => {
                setMaxPages(event.target.value);
                resetActivePresets();
              }}
              className={`${s.pageFilterInput} glass`}
              placeholder="Max pages"
              aria-label="Maximum page count"
            />
          </div>

          <div className={s.sortRow}>
            <span className={s.sectionLabel}>
              <Filter size={14} />
              Sort & view
            </span>
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`glass ${s.sortBtn} ${sortBy === option.value ? s.viewBtnActive : ''}`}
                onClick={() => setSortBy(option.value)}
              >
                {option.label}
              </button>
            ))}
            <button type="button" className={`glass ${s.sortBtn}`} onClick={() => setSortAsc(!sortAsc)}>
              <ArrowUpDown size={14} />
              {sortAsc ? 'Ascending' : 'Descending'}
            </button>
            <div className={s.viewToggle}>
              <button
                type="button"
                className={`${s.viewBtn} ${viewMode === 'grid' ? s.viewBtnActive : ''}`}
                onClick={() => setViewMode('grid')}
                aria-label="Show grid view"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                type="button"
                className={`${s.viewBtn} ${viewMode === 'masonry' ? s.viewBtnActive : ''}`}
                onClick={() => setViewMode('masonry')}
                aria-label="Show cover columns view"
              >
                <Columns2 size={16} />
              </button>
              <button
                type="button"
                className={`${s.viewBtn} ${viewMode === 'list' ? s.viewBtnActive : ''}`}
                onClick={() => setViewMode('list')}
                aria-label="Show list view"
              >
                <List size={16} />
              </button>
            </div>
          </div>
        </>
      )}

      {selectionMode && !emptyLibrary && (
        <div className={`glass ${s.bulkBar}`}>
          <div className={s.bulkSummary}>
            <strong>{selectedIds.length}</strong>
            <span>selected</span>
          </div>
          <div className={s.bulkActions}>
            <button type="button" className={`glass ${s.bulkBtn}`} onClick={toggleVisibleSelection}>
              Select visible
            </button>
            <button type="button" className={`glass ${s.bulkBtn}`} onClick={() => handleBulkStatus('reading')}>
              Mark reading
            </button>
            <button type="button" className={`glass ${s.bulkBtn}`} onClick={() => handleBulkStatus('read')}>
              Mark read
            </button>
            <button type="button" className={`glass ${s.bulkBtn}`} onClick={handleBulkResolveReview}>
              Resolve review
            </button>
            <select
              aria-label="Bulk assign shelf"
              className={`${s.bulkSelect} glass`}
              value={bulkShelfId}
              onChange={(event) => setBulkShelfId(event.target.value)}
            >
              <option value="">Assign shelf...</option>
              {shelves.map((shelf) => (
                <option key={shelf.id} value={shelf.id}>
                  {shelf.name}
                </option>
              ))}
            </select>
            <button type="button" className={`glass ${s.bulkBtn}`} onClick={handleBulkAssignShelf} disabled={!bulkShelfId}>
              Apply shelf
            </button>
            <button type="button" className={`glass ${s.bulkBtn} ${s.bulkDanger}`} onClick={() => void handleBulkDelete()}>
              <Trash2 size={14} />
              Delete selected
            </button>
          </div>
        </div>
      )}

      {emptyLibrary && (
        <div className={`glass ${s.emptyState}`}>
          <div className={s.emptyIcon}>
            <LibraryBig size={28} />
          </div>
          <h3>Start your library</h3>
          <p className={s.heroText}>Scan a first stack, then come back here to review, sort, and save views for later.</p>
          <div className={s.emptyActions}>
            <button type="button" className={`glass ${s.primaryAction}`} onClick={onStartScanning}>
              <ScanLine size={16} />
              Add your first book
            </button>
            <button type="button" className={`glass ${s.secondaryAction}`} onClick={() => navigate('/data')}>
              <Settings size={16} />
              Import & export
            </button>
          </div>
        </div>
      )}

      {emptyFilteredResults && (
        <div className={`glass ${s.emptyState}`}>
          <div className={s.emptyIcon}>
            <Filter size={28} />
          </div>
          <h3>No books match those filters</h3>
          <p className={s.heroText}>Try widening the search, relaxing page limits, or clearing review-only mode.</p>
          <button type="button" className={`glass ${s.clearBtn}`} onClick={clearFilters}>
            <RotateCcw size={16} />
            Reset filters
          </button>
        </div>
      )}

      {!emptyLibrary && !emptyFilteredResults && (viewMode === 'grid' || viewMode === 'masonry') && (
        <div
          ref={gridParentRef}
          className={`glass ${s.virtualContainer} ${viewMode === 'masonry' ? s.virtualContainerMasonry : ''}`}
        >
          <div className={s.virtualInner} style={{ height: `${gridVirtualizer.getTotalSize()}px` }}>
            {gridVirtualizer.getVirtualItems().map((virtualRow) => {
              const rowBooks = filteredAndSorted.slice(
                virtualRow.index * effectiveGridColumns,
                virtualRow.index * effectiveGridColumns + effectiveGridColumns
              );
              return (
                <div
                  key={virtualRow.key}
                  className={s.gridRow}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {rowBooks.map((book) => (
                    <div key={book.id} className={`${s.cardWrap} ${viewMode === 'masonry' ? s.cardWrapMasonry : ''}`}>
                      {selectionMode && (
                        <label className={`glass ${s.selectToggle}`}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(book.id)}
                            onChange={() => toggleBookSelection(book.id)}
                          />
                          Select
                        </label>
                      )}
                      <BookCard book={book} onActivateBookId={openBookById} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!emptyLibrary && !emptyFilteredResults && viewMode === 'list' && (
        <div ref={listParentRef} className={`glass ${s.virtualContainer}`}>
          <div className={s.virtualInner} style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const book = filteredAndSorted[virtualItem.index];
              if (!book) return null;
              const progress = getReadingProgressPercent(book);
              return (
                <div
                  key={virtualItem.key}
                  className={s.listRow}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                  onClick={() => handleBookOpen(book)}
                >
                  {selectionMode && (
                    <label className={s.listSelect} onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(book.id)}
                        onChange={() => toggleBookSelection(book.id)}
                      />
                    </label>
                  )}
                  <img
                    src={getBookCoverSrc(book.coverImg)}
                    alt={book.title}
                    className={s.listCover}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                  />
                  <div className={s.listInfo}>
                    <div className={s.listTitle}>{book.title}</div>
                    <div className={s.listAuthor}>{book.author}</div>
                    <div className={s.listMeta}>
                      <span>{book.pageCount > 0 ? `${book.pageCount} pages` : 'Page count unknown'}</span>
                      <span>{progress}% read</span>
                      {book.needsReview && <span className={s.reviewBadgeInline}>Needs review</span>}
                    </div>
                  </div>
                  <span className={`status-badge status-${book.status} ${s.listStatus}`}>{book.status}</span>
                  <div className={s.listStatusChips} onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      className={`${s.listStatusChip} ${book.status === 'to-read' ? s.listStatusChipActive : ''}`}
                      onClick={() => updateBookStatus(book.id, 'to-read')}
                      aria-label={`Mark ${book.title} as to read`}
                    >
                      <Clock size={12} />
                    </button>
                    <button
                      type="button"
                      className={`${s.listStatusChip} ${book.status === 'reading' ? s.listStatusChipActive : ''}`}
                      onClick={() => updateBookStatus(book.id, 'reading')}
                      aria-label={`Mark ${book.title} as reading`}
                    >
                      <BookOpen size={12} />
                    </button>
                    <button
                      type="button"
                      className={`${s.listStatusChip} ${book.status === 'read' ? s.listStatusChipActive : ''}`}
                      onClick={() => updateBookStatus(book.id, 'read')}
                      aria-label={`Mark ${book.title} as read`}
                    >
                      <CheckCircle size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {freshSelectedBook && (
        <BookDetail
          book={freshSelectedBook}
          onClose={() => setSelectedBook(null)}
        />
      )}
    </section>
  );
}
