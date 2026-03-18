import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useBookStore } from '../store/useBookStore.ts';
import { useProfileStore } from '../store/useProfileStore.ts';
import BookCard from './BookCard.tsx';
import BookDetail from './BookDetail.tsx';
import ShelfManager from './ShelfManager.tsx';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Search, Settings, ArrowUpDown, Filter, BookOpen, Clock, CheckCircle, XCircle,
  BarChart3, Tag, LayoutGrid, List, Sparkles, RotateCcw, ScanLine, LibraryBig,
  Zap, CheckSquare, Trash2
} from 'lucide-react';
import type { BookEntry } from '../types.ts';
import { getActiveLibraryFilterLabels, getBookCoverSrc, getLibraryInsights } from '../utils/bookPresentation.ts';
import { matchesSmartShelf } from '../utils/smartShelf.ts';
import { useToast } from './Toast.tsx';
import s from './LibraryList.module.css';

type SortField = 'title' | 'author' | 'dateAdded' | 'pageCount';
type StatusFilter = BookEntry['status'] | 'all';
type ViewMode = 'grid' | 'list';

interface LibraryListProps {
    onManageData?: () => void;
    onStartScanning?: () => void;
    initialOpenIsbn?: string | null;
    onOpenComplete?: () => void;
}

const LibraryList: React.FC<LibraryListProps> = ({ onManageData, onStartScanning, initialOpenIsbn, onOpenComplete }) => {
    const { books, shelves, smartShelves, updateBookStatus, removeBook, assignShelf } = useBookStore();
    const { preferences, updatePreferences } = useProfileStore();
    const { toast, confirm } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const sortBy = preferences.librarySortBy;
    const sortAsc = preferences.librarySortAsc;
    const statusFilter = preferences.libraryStatusFilter;
    const viewMode = preferences.libraryViewMode;
    const showStats = preferences.showStatsDefault;
    const showShelves = preferences.showShelvesDefault;
    const [shelfFilter, setShelfFilter] = useState<string | null>(null);
    const [smartShelfFilter, setSmartShelfFilter] = useState<string | null>(null);
    const [selectedBook, setSelectedBook] = useState<BookEntry | null>(null);
    const [selectMode, setSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkShelfOpen, setBulkShelfOpen] = useState(false);

    const setSortBy = useCallback((v: SortField) => updatePreferences({ librarySortBy: v }), [updatePreferences]);
    const setSortAsc = useCallback((v: boolean) => updatePreferences({ librarySortAsc: v }), [updatePreferences]);
    const setStatusFilter = useCallback((v: StatusFilter) => updatePreferences({ libraryStatusFilter: v }), [updatePreferences]);
    const setViewMode = useCallback((v: ViewMode) => updatePreferences({ libraryViewMode: v }), [updatePreferences]);
    const setShowStats = useCallback((v: boolean) => updatePreferences({ showStatsDefault: v }), [updatePreferences]);
    const setShowShelves = useCallback((v: boolean) => updatePreferences({ showShelvesDefault: v }), [updatePreferences]);

    const listParentRef = useRef<HTMLDivElement>(null);
    const gridParentRef = useRef<HTMLDivElement>(null);
    const GRID_COL_WIDTH = 160;
    const [gridColumns, setGridColumns] = useState(4);

    useEffect(() => {
        const container = gridParentRef.current;
        if (!container || viewMode !== 'grid') return;
        const observer = new ResizeObserver(([entry]) => {
            const cols = Math.max(1, Math.floor(entry.contentRect.width / GRID_COL_WIDTH));
            setGridColumns(cols);
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, [viewMode]);

    const insights = useMemo(() => getLibraryInsights(books), [books]);

    const toggleSelect = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const exitSelectMode = useCallback(() => {
        setSelectMode(false);
        setSelectedIds(new Set());
        setBulkShelfOpen(false);
    }, []);

    const filteredAndSorted = useMemo(() => {
        let result = books.filter(book =>
            book.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            book.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
            book.isbn.includes(searchTerm)
        );

        if (statusFilter !== 'all') result = result.filter(b => b.status === statusFilter);
        if (shelfFilter) result = result.filter(b => (b.shelfIds || []).includes(shelfFilter));
        if (smartShelfFilter) {
            const ss = smartShelves.find((s) => s.id === smartShelfFilter);
            if (ss) result = result.filter((b) => matchesSmartShelf(b, ss));
        }

        result.sort((a, b) => {
            let cmp = 0;
            switch (sortBy) {
                case 'title': cmp = a.title.localeCompare(b.title); break;
                case 'author': cmp = a.author.localeCompare(b.author); break;
                case 'dateAdded': cmp = a.dateAdded.localeCompare(b.dateAdded); break;
                case 'pageCount': cmp = (a.pageCount || 0) - (b.pageCount || 0); break;
            }
            return sortAsc ? cmp : -cmp;
        });

        return result;
    }, [books, searchTerm, statusFilter, shelfFilter, smartShelfFilter, smartShelves, sortBy, sortAsc]);

    const selectedShelf = shelves.find((shelf) => shelf.id === shelfFilter) ?? null;
    const activeFilters = useMemo(() => getActiveLibraryFilterLabels({
        searchTerm,
        statusFilter,
        shelfName: selectedShelf?.name ?? null,
    }), [searchTerm, statusFilter, selectedShelf?.name]);

    const showRecentSection = activeFilters.length === 0;
    const clearFilters = useCallback(() => {
        setSearchTerm('');
        setStatusFilter('all');
        setShelfFilter(null);
        setSmartShelfFilter(null);
    }, [setStatusFilter]);

    const bulkSetStatus = useCallback((status: BookEntry['status']) => {
        selectedIds.forEach((id) => updateBookStatus(id, status));
        toast(`Updated ${selectedIds.size} book${selectedIds.size !== 1 ? 's' : ''}`, 'success');
        exitSelectMode();
    }, [selectedIds, updateBookStatus, toast, exitSelectMode]);

    const bulkAssignShelf = useCallback((shelfId: string) => {
        selectedIds.forEach((id) => assignShelf(id, shelfId));
        toast(`Added ${selectedIds.size} book${selectedIds.size !== 1 ? 's' : ''} to shelf`, 'success');
        exitSelectMode();
    }, [selectedIds, assignShelf, toast, exitSelectMode]);

    const bulkRemove = useCallback(async () => {
        const yes = await confirm({
            title: 'Remove Books',
            message: `Remove ${selectedIds.size} book${selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`,
            confirmLabel: 'Remove',
            danger: true,
        });
        if (!yes) return;
        selectedIds.forEach((id) => removeBook(id));
        toast(`Removed ${selectedIds.size} book${selectedIds.size !== 1 ? 's' : ''}`, 'info');
        exitSelectMode();
    }, [selectedIds, removeBook, confirm, toast, exitSelectMode]);

    const virtualizer = useVirtualizer({
        count: filteredAndSorted.length,
        getScrollElement: () => listParentRef.current,
        estimateSize: () => 76,
        overscan: 8,
    });

    const gridRowCount = Math.ceil(filteredAndSorted.length / gridColumns);

    const gridVirtualizer = useVirtualizer({
        count: gridRowCount,
        getScrollElement: () => gridParentRef.current,
        estimateSize: () => 260,
        overscan: 4,
    });

    const handleSortToggle = (field: SortField) => {
        if (sortBy === field) setSortAsc(!sortAsc);
        else {
            setSortBy(field);
            setSortAsc(field === 'title' || field === 'author');
        }
    };

    const countBooksOnShelf = (shelfId: string) =>
        books.filter(b => (b.shelfIds || []).includes(shelfId)).length;

    const openDetail = useCallback((book: BookEntry) => setSelectedBook(book), []);
    const closeDetail = useCallback(() => setSelectedBook(null), []);

    useEffect(() => {
        if (initialOpenIsbn) {
            const book = books.find(b => b.isbn === initialOpenIsbn);
            if (book) setSelectedBook(book);
            onOpenComplete?.();
        }
    }, [initialOpenIsbn, books, onOpenComplete]);

    const freshSelectedBook = selectedBook
        ? books.find(b => b.id === selectedBook.id) ?? null
        : null;

    const statusFilters: { value: StatusFilter; label: string; icon: React.ReactNode; color: string }[] = [
        { value: 'all', label: 'All', icon: null, color: 'var(--text-muted)' },
        { value: 'to-read', label: 'To Read', icon: <Clock size={14} />, color: '#38bdf8' },
        { value: 'reading', label: 'Reading', icon: <BookOpen size={14} />, color: '#a855f7' },
        { value: 'read', label: 'Read', icon: <CheckCircle size={14} />, color: '#22c55e' },
        { value: 'dnf', label: 'DNF', icon: <XCircle size={14} />, color: '#ef4444' },
    ];

    const emptyLibrary = books.length === 0;
    const emptyFilteredResults = !emptyLibrary && filteredAndSorted.length === 0;

    return (
        <div className={s.container}>
            <section className={`glass ${s.hero}`} aria-label="Library overview">
                <div className={s.heroCopy}>
                    <span className={s.eyebrow}><Sparkles size={14} /> Reading dashboard</span>
                    <h2 className={s.title}>Your library, built for browsing not digging.</h2>
                    <p className={s.heroText}>
                        Search fast, recover from filters quickly, and keep your next read visible.
                    </p>
                    <div className={s.heroActions}>
                        <button type="button" onClick={onStartScanning} className={`glass ${s.primaryAction}`}>
                            <ScanLine size={18} /> {emptyLibrary ? 'Add a book' : 'Continue scanning'}
                        </button>
                        <button type="button" onClick={() => setShowStats(!showStats)} className={`glass ${s.secondaryAction}`}>
                            <BarChart3 size={18} /> {showStats ? 'Hide stats' : 'Show stats'}
                        </button>
                    </div>
                </div>

                <div className={s.highlightGrid}>
                    <div className={`glass ${s.highlightCard}`}>
                        <span className={s.highlightLabel}>Collection</span>
                        <strong>{insights.totalBooks}</strong>
                        <span>{insights.toReadCount} still waiting on the shelf</span>
                    </div>
                    {insights.currentlyReading ? (
                        <div className={`glass ${s.highlightCard}`}>
                            <span className={s.highlightLabel}>Reading now</span>
                            <strong>{insights.currentlyReading.title}</strong>
                            <span>{insights.currentlyReading.author}</span>
                        </div>
                    ) : (
                        <button type="button" className={`glass ${s.highlightCard} ${s.highlightCardCta}`}
                            onClick={() => setStatusFilter('to-read')}
                            aria-label="Show To Read books to pick your next read">
                            <span className={s.highlightLabel}>Reading now</span>
                            <strong>Choose your next book</strong>
                            <span>Tap a book and mark as Reading to pin it here.</span>
                        </button>
                    )}
                    <div className={`glass ${s.highlightCard}`}>
                        <span className={s.highlightLabel}>Finished</span>
                        <strong>{insights.completionRate}% complete</strong>
                        <span>{insights.readCount} finished, {insights.pagesRead.toLocaleString()} pages read</span>
                    </div>
                </div>
            </section>

            <div className={s.header}>
                <div>
                    <div className={s.sectionLabel}>Library</div>
                    <h3 className={s.heading}>Books you can find in seconds</h3>
                    <p className={s.resultsSummary}>
                        {filteredAndSorted.length} result{filteredAndSorted.length === 1 ? '' : 's'} shown, sorted by {sortBy === 'dateAdded' ? 'date added' : sortBy}.
                    </p>
                </div>
                <div className={s.headerActions}>
                    <button onClick={() => { setSelectMode(!selectMode); if (selectMode) exitSelectMode(); }}
                        className={`glass ${s.iconBtn}`}
                        aria-label={selectMode ? 'Exit select mode' : 'Enter select mode'}
                        style={{
                            color: selectMode ? 'var(--accent-blue)' : 'var(--text-muted)',
                            background: selectMode ? 'rgba(56, 189, 248, 0.1)' : undefined,
                        }}>
                        <CheckSquare size={20} />
                    </button>
                    <button onClick={() => setShowShelves(!showShelves)} className={`glass ${s.iconBtn}`}
                        aria-label="Toggle shelf manager"
                        style={{
                            color: showShelves ? 'var(--accent-purple)' : 'var(--text-muted)',
                            background: showShelves ? 'rgba(168, 85, 247, 0.1)' : undefined,
                        }}>
                        <Tag size={20} />
                    </button>
                    <button onClick={() => setShowStats(!showStats)} className={`glass ${s.iconBtn}`}
                        aria-label="Toggle reading statistics"
                        style={{
                            color: showStats ? 'var(--accent-blue)' : 'var(--text-muted)',
                            background: showStats ? 'rgba(56, 189, 248, 0.1)' : undefined,
                        }}>
                        <BarChart3 size={20} />
                    </button>
                    <button onClick={onManageData} className={`glass ${s.manageBtn}`} aria-label="Manage library data">
                        <Settings size={20} />
                        <span>Manage</span>
                    </button>
                </div>
            </div>

            {showShelves && <ShelfManager />}

            {showStats && (
                <div className={`glass ${s.stats}`}>
                    {[
                        { value: insights.totalBooks, label: 'Total Books' },
                        { value: insights.readCount, label: 'Read', color: '#22c55e' },
                        { value: insights.readingCount, label: 'Reading', color: '#a855f7' },
                        { value: insights.toReadCount, label: 'To Read', color: '#38bdf8' },
                        { value: insights.pagesRead.toLocaleString(), label: 'Pages Read' },
                        { value: insights.totalPages.toLocaleString(), label: 'Total Pages' },
                    ].map((item) => (
                        <div key={item.label} className={s.statItem}>
                            <div className={s.statValue} style={item.color ? { color: item.color } : undefined}>{item.value}</div>
                            <div className={s.statLabel}>{item.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {showRecentSection && insights.recentlyAdded.length > 0 && (
                <section className={s.recentSection} aria-label="Recently added books">
                    <div className={s.recentHeader}>
                        <span className={s.sectionLabel}>Recently added</span>
                        <span className={s.recentHint}>Tap any title to open details</span>
                    </div>
                    <div className={s.recentGrid}>
                        {insights.recentlyAdded.map((book) => (
                            <button key={book.id} type="button" className={`glass ${s.recentCard}`} onClick={() => openDetail(book)}>
                                <img src={getBookCoverSrc(book.coverImg)} alt={book.title} className={s.recentCover} />
                                <div className={s.recentMeta}>
                                    <strong>{book.title}</strong>
                                    <span>{book.author}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>
            )}

            <div className={s.searchRow}>
                <div className={s.searchWrap}>
                    <Search size={18} className={s.searchIcon} />
                    <input type="text" placeholder="Search title, author, or ISBN" value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={`glass ${s.searchInput}`} aria-label="Search library" />
                </div>
                {activeFilters.length > 0 && (
                    <button type="button" onClick={clearFilters} className={`glass ${s.clearBtn}`}>
                        <RotateCcw size={16} /> Clear filters
                    </button>
                )}
            </div>

            {activeFilters.length > 0 && (
                <div className={s.activeFilters} aria-label="Active filters">
                    {activeFilters.map((filter) => (
                        <span key={filter} className={`glass ${s.activeFilterChip}`}>{filter}</span>
                    ))}
                </div>
            )}

            <div className={s.filterRow}>
                <Filter size={16} style={{ color: 'var(--text-muted)' }} />
                {statusFilters.map(f => (
                    <button key={f.value} onClick={() => setStatusFilter(f.value)}
                        className={`glass ${s.filterBtn}`}
                        style={{
                            color: statusFilter === f.value ? f.color : 'var(--text-muted)',
                            background: statusFilter === f.value ? `${f.color}20` : undefined,
                        }}>
                        {f.icon} {f.label}
                        {f.value !== 'all' && (
                            <span className={s.filterCount}>
                                ({f.value === 'to-read' ? insights.toReadCount : f.value === 'reading' ? insights.readingCount : f.value === 'read' ? insights.readCount : insights.dnfCount})
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {(shelves.length > 0 || smartShelves.length > 0) && (
                <div className={s.filterRow}>
                    <Tag size={16} style={{ color: 'var(--text-muted)' }} />
                    <button onClick={() => { setShelfFilter(null); setSmartShelfFilter(null); }}
                        className={`glass ${s.filterBtn}`}
                        style={{ opacity: shelfFilter === null && smartShelfFilter === null ? 1 : 0.6 }}>
                        All Shelves
                    </button>
                    {shelves.map(shelf => (
                        <button key={shelf.id}
                            onClick={() => { setSmartShelfFilter(null); setShelfFilter(shelfFilter === shelf.id ? null : shelf.id); }}
                            className={`glass ${s.filterBtn}`}
                            style={{
                                color: shelfFilter === shelf.id ? shelf.color : 'var(--text-muted)',
                                background: shelfFilter === shelf.id ? `${shelf.color}20` : undefined,
                                borderLeft: `3px solid ${shelf.color}`,
                            }}>
                            {shelf.name} <span className={s.filterCount}>({countBooksOnShelf(shelf.id)})</span>
                        </button>
                    ))}
                    {smartShelves.map(ss => (
                        <button key={ss.id}
                            onClick={() => { setShelfFilter(null); setSmartShelfFilter(smartShelfFilter === ss.id ? null : ss.id); }}
                            className={`glass ${s.filterBtn} ${s.smartShelfBtn}`}
                            style={{
                                color: smartShelfFilter === ss.id ? ss.color : 'var(--text-muted)',
                                background: smartShelfFilter === ss.id ? `${ss.color}20` : undefined,
                                borderLeft: `3px solid ${ss.color}`,
                            }}>
                            <Zap size={11} />
                            {ss.name}
                            <span className={s.filterCount}>
                                ({books.filter((b) => matchesSmartShelf(b, ss)).length})
                            </span>
                        </button>
                    ))}
                </div>
            )}

            <div className={s.sortRow}>
                <ArrowUpDown size={16} style={{ color: 'var(--text-muted)' }} />
                {([
                    ['dateAdded', 'Date'],
                    ['title', 'Title'],
                    ['author', 'Author'],
                    ['pageCount', 'Pages'],
                ] as [SortField, string][]).map(([field, label]) => (
                    <button key={field} onClick={() => handleSortToggle(field)}
                        className={`glass ${s.sortBtn}`}
                        style={{
                            color: sortBy === field ? 'var(--accent-blue)' : 'var(--text-muted)',
                            background: sortBy === field ? 'rgba(56, 189, 248, 0.1)' : undefined,
                        }}>
                        {label} {sortBy === field && (sortAsc ? '\u2191' : '\u2193')}
                    </button>
                ))}

                <div className={s.viewToggle}>
                    <button onClick={() => setViewMode('grid')}
                        className={`${s.viewBtn} ${viewMode === 'grid' ? s.viewBtnActive : ''}`}
                        aria-label="Grid view">
                        <LayoutGrid size={14} />
                    </button>
                    <button onClick={() => setViewMode('list')}
                        className={`${s.viewBtn} ${viewMode === 'list' ? s.viewBtnActive : ''}`}
                        aria-label="List view">
                        <List size={14} />
                    </button>
                </div>
            </div>

            {emptyLibrary ? (
                <div className={`glass ${s.emptyState}`}>
                    <div className={s.emptyIcon}><LibraryBig size={28} /></div>
                    <h4>Build a library that feels easy to use</h4>
                    <p>Add your first book by scanning a spine, uploading a photo, or typing the ISBN.</p>
                    <div className={s.emptyActions}>
                        <button type="button" onClick={onStartScanning} className={`glass ${s.primaryAction}`}>
                            <ScanLine size={18} /> Add your first book
                        </button>
                        <button type="button" onClick={onManageData} className={`glass ${s.secondaryAction}`}>
                            <Settings size={18} /> Import or manage data
                        </button>
                    </div>
                </div>
            ) : emptyFilteredResults ? (
                <div className={`glass ${s.emptyState}`}>
                    <div className={s.emptyIcon}><Filter size={28} /></div>
                    <h4>No books match those filters</h4>
                    <p>Clear the search and filters to get back to your full shelf in one tap.</p>
                    <button type="button" onClick={clearFilters} className={`glass ${s.primaryAction}`}>
                        <RotateCcw size={18} /> Reset filters
                    </button>
                </div>
            ) : viewMode === 'grid' ? (
                <div ref={gridParentRef} className={s.virtualContainer}
                     style={{ height: Math.min(gridRowCount * 260, 700) }}>
                    <div className={s.virtualInner} style={{ height: gridVirtualizer.getTotalSize() }}>
                        {gridVirtualizer.getVirtualItems().map((vRow) => {
                            const startIdx = vRow.index * gridColumns;
                            const rowBooks = filteredAndSorted.slice(startIdx, startIdx + gridColumns);
                            return (
                                <div key={vRow.index}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        transform: `translateY(${vRow.start}px)`,
                                    }}>
                                    <div className={s.gridRow}>
                                        {rowBooks.map((book) => (
                                            <BookCard key={book.id} book={book}
                                                onClick={() => selectMode ? toggleSelect(book.id) : openDetail(book)}
                                                selected={selectMode && selectedIds.has(book.id)}
                                                selectMode={selectMode} />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div ref={listParentRef} className={s.virtualContainer}
                     style={{ height: Math.min(filteredAndSorted.length * 76, 600) }}>
                    <div className={s.virtualInner} style={{ height: virtualizer.getTotalSize() }}>
                        {virtualizer.getVirtualItems().map((vRow) => {
                            const book = filteredAndSorted[vRow.index];
                            return (
                                <div key={book.id}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        transform: `translateY(${vRow.start}px)`,
                                    }}>
                                    <div className={s.listRow}
                                         onClick={() => selectMode ? toggleSelect(book.id) : openDetail(book)}
                                         style={selectMode && selectedIds.has(book.id) ? { outline: '2px solid var(--accent-blue)', background: 'rgba(56,189,248,0.06)' } : undefined}
                                         role="button" tabIndex={0}
                                         onKeyDown={(e) => { if (e.key === 'Enter') openDetail(book); }}>
                                        <img src={getBookCoverSrc(book.coverImg)}
                                             alt={book.title} className={s.listCover} />
                                        <div className={s.listInfo}>
                                            <div className={s.listTitle}>{book.title}</div>
                                            <div className={s.listAuthor}>{book.author}</div>
                                        </div>
                                        <div className={s.listStatusChips} onClick={(e) => e.stopPropagation()}>
                                            {statusFilters.filter(f => f.value !== 'all').map((f) => (
                                                <button key={f.value}
                                                    type="button"
                                                    onClick={() => updateBookStatus(book.id, f.value as BookEntry['status'])}
                                                    className={`${s.listStatusChip} ${book.status === f.value ? s.listStatusChipActive : ''}`}
                                                    style={book.status === f.value ? { color: f.color, background: `${f.color}20` } : undefined}
                                                    title={f.label} aria-label={`Set status to ${f.label}`}>
                                                    {f.icon}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {freshSelectedBook && !selectMode && (
                <BookDetail book={freshSelectedBook} onClose={closeDetail} />
            )}

            {selectMode && (
                <div className={s.bulkBar} role="toolbar" aria-label="Bulk actions">
                    <div className={s.bulkCount}>
                        <span>{selectedIds.size} selected</span>
                        <button className={s.bulkLink}
                            onClick={() => setSelectedIds(new Set(filteredAndSorted.map((b) => b.id)))}>
                            All
                        </button>
                        <button className={s.bulkLink} onClick={() => setSelectedIds(new Set())}>
                            None
                        </button>
                        <button className={s.bulkLink} onClick={exitSelectMode}>
                            Cancel
                        </button>
                    </div>
                    {selectedIds.size > 0 && (
                        <div className={s.bulkActions}>
                            {statusFilters.filter(f => f.value !== 'all').map((f) => (
                                <button key={f.value}
                                    onClick={() => bulkSetStatus(f.value as BookEntry['status'])}
                                    className={s.bulkStatusBtn}
                                    style={{ color: f.color, background: `${f.color}15` }}
                                    title={`Mark as ${f.label}`}
                                    aria-label={`Mark selected as ${f.label}`}>
                                    {f.icon}
                                </button>
                            ))}
                            {shelves.length > 0 && (
                                <div style={{ position: 'relative' }}>
                                    <button onClick={() => setBulkShelfOpen(!bulkShelfOpen)}
                                        className={s.bulkActionBtn}
                                        aria-label="Add selected to shelf">
                                        <Tag size={14} /> Shelf
                                    </button>
                                    {bulkShelfOpen && (
                                        <div className={s.bulkShelfDrop}>
                                            {shelves.map((sh) => (
                                                <button key={sh.id}
                                                    onClick={() => bulkAssignShelf(sh.id)}
                                                    className={s.bulkShelfItem}
                                                    style={{ color: sh.color }}>
                                                    <span className={s.bulkShelfDot} style={{ background: sh.color }} />
                                                    {sh.name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                            <button onClick={bulkRemove} className={s.bulkRemoveBtn} aria-label="Remove selected books">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default LibraryList;
