import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useBookStore } from '../store/useBookStore.ts';
import BookCard from './BookCard.tsx';
import BookDetail from './BookDetail.tsx';
import ShelfManager from './ShelfManager.tsx';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Search, Settings, ArrowUpDown, Filter, BookOpen, Clock, CheckCircle, XCircle,
  BarChart3, Tag, LayoutGrid, List
} from 'lucide-react';
import type { BookEntry } from '../types.ts';
import s from './LibraryList.module.css';

type SortField = 'title' | 'author' | 'dateAdded' | 'pageCount';
type StatusFilter = BookEntry['status'] | 'all';
type ViewMode = 'grid' | 'list';

interface LibraryListProps {
    onManageData?: () => void;
    /** When set, opens the book with this ISBN in the detail panel. Cleared via onOpenComplete. */
    initialOpenIsbn?: string | null;
    /** Called after opening a book via initialOpenIsbn so the parent can clear the prop. */
    onOpenComplete?: () => void;
}

const LibraryList: React.FC<LibraryListProps> = ({ onManageData, initialOpenIsbn, onOpenComplete }) => {
    const { books, shelves } = useBookStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState<SortField>('dateAdded');
    const [sortAsc, setSortAsc] = useState(false);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [shelfFilter, setShelfFilter] = useState<string | null>(null);
    const [showStats, setShowStats] = useState(false);
    const [showShelves, setShowShelves] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [selectedBook, setSelectedBook] = useState<BookEntry | null>(null);

    const listParentRef = useRef<HTMLDivElement>(null);
    const gridParentRef = useRef<HTMLDivElement>(null);

    /** Number of columns in grid view. Uses a fixed estimate based on typical card width (~160px). */
    const GRID_COL_WIDTH = 160;
    const [gridColumns, setGridColumns] = useState(4);

    // Measure grid container width to determine column count
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

    const stats = useMemo(() => {
        const toRead = books.filter(b => b.status === 'to-read').length;
        const reading = books.filter(b => b.status === 'reading').length;
        const read = books.filter(b => b.status === 'read').length;
        const dnf = books.filter(b => b.status === 'dnf').length;
        const totalPages = books.reduce((sum, b) => sum + (b.pageCount || 0), 0);
        const readPages = books.filter(b => b.status === 'read').reduce((sum, b) => sum + (b.pageCount || 0), 0);
        return { total: books.length, toRead, reading, read, dnf, totalPages, readPages };
    }, [books]);

    const filteredAndSorted = useMemo(() => {
        let result = books.filter(book =>
            book.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            book.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
            book.isbn.includes(searchTerm)
        );

        if (statusFilter !== 'all') result = result.filter(b => b.status === statusFilter);
        if (shelfFilter) result = result.filter(b => (b.shelfIds || []).includes(shelfFilter));

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
    }, [books, searchTerm, statusFilter, shelfFilter, sortBy, sortAsc]);

    // Virtualizer for list view
    // eslint-disable-next-line react-hooks/incompatible-library
    const virtualizer = useVirtualizer({
        count: filteredAndSorted.length,
        getScrollElement: () => listParentRef.current,
        estimateSize: () => 76, // approx row height
        overscan: 8,
    });

    // Virtualizer for grid view (virtualizes rows; each row has gridColumns items)
    const gridRowCount = Math.ceil(filteredAndSorted.length / gridColumns);

    const gridVirtualizer = useVirtualizer({
        count: gridRowCount,
        getScrollElement: () => gridParentRef.current,
        estimateSize: () => 260, // approx card height
        overscan: 4,
    });

    const handleSortToggle = (field: SortField) => {
        if (sortBy === field) setSortAsc(!sortAsc);
        else { setSortBy(field); setSortAsc(field === 'title' || field === 'author'); }
    };

    const countBooksOnShelf = (shelfId: string) =>
        books.filter(b => (b.shelfIds || []).includes(shelfId)).length;

    const openDetail = useCallback((book: BookEntry) => setSelectedBook(book), []);
    const closeDetail = useCallback(() => setSelectedBook(null), []);

    // Open book when initialOpenIsbn is set (e.g. from duplicate-scan flow)
    useEffect(() => {
        if (initialOpenIsbn) {
            const book = books.find(b => b.isbn === initialOpenIsbn);
            if (book) setSelectedBook(book);
            onOpenComplete?.();
        }
    }, [initialOpenIsbn, books, onOpenComplete]);

    // Keep selectedBook fresh
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

    const statusColors: Record<string, string> = {
        'to-read': '#38bdf8',
        reading: '#a855f7',
        read: '#22c55e',
        dnf: '#ef4444',
    };

    return (
        <div className={s.container}>
            <div className={s.header}>
                <h2 className={s.title}>Your Library ({books.length})</h2>
                <div className={s.headerActions}>
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
                    </button>
                </div>
            </div>

            {showShelves && <ShelfManager />}

            {showStats && (
                <div className={`glass ${s.stats}`}>
                    {[
                        { value: stats.total, label: 'Total Books' },
                        { value: stats.read, label: 'Read', color: '#22c55e' },
                        { value: stats.reading, label: 'Reading', color: '#a855f7' },
                        { value: stats.toRead, label: 'To Read', color: '#38bdf8' },
                        { value: stats.readPages.toLocaleString(), label: 'Pages Read' },
                        { value: stats.totalPages.toLocaleString(), label: 'Total Pages' },
                    ].map((item) => (
                        <div key={item.label} className={s.statItem}>
                            <div className={s.statValue} style={item.color ? { color: item.color } : undefined}>{item.value}</div>
                            <div className={s.statLabel}>{item.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Search */}
            <div className={s.searchRow}>
                <div className={s.searchWrap}>
                    <Search size={18} className={s.searchIcon} />
                    <input type="text" placeholder="Search library..." value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={`glass ${s.searchInput}`} aria-label="Search library" />
                </div>
            </div>

            {/* Status filters */}
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
                                ({f.value === 'to-read' ? stats.toRead : f.value === 'reading' ? stats.reading : f.value === 'read' ? stats.read : stats.dnf})
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Shelf filters */}
            {shelves.length > 0 && (
                <div className={s.filterRow}>
                    <Tag size={16} style={{ color: 'var(--text-muted)' }} />
                    <button onClick={() => setShelfFilter(null)} className={`glass ${s.filterBtn}`}
                        style={{ opacity: shelfFilter === null ? 1 : 0.6 }}>
                        All Shelves
                    </button>
                    {shelves.map(shelf => (
                        <button key={shelf.id}
                            onClick={() => setShelfFilter(shelfFilter === shelf.id ? null : shelf.id)}
                            className={`glass ${s.filterBtn}`}
                            style={{
                                color: shelfFilter === shelf.id ? shelf.color : 'var(--text-muted)',
                                background: shelfFilter === shelf.id ? `${shelf.color}20` : undefined,
                                borderLeft: `3px solid ${shelf.color}`,
                            }}>
                            {shelf.name} <span className={s.filterCount}>({countBooksOnShelf(shelf.id)})</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Sort + view toggle */}
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

            {/* Book display */}
            {filteredAndSorted.length === 0 ? (
                <div className={s.empty}>
                    {searchTerm || statusFilter !== 'all' || shelfFilter
                        ? 'No books match your filters.'
                        : 'Your library is empty. Scan a book to get started!'}
                </div>
            ) : viewMode === 'grid' ? (
                /* Virtualized grid view */
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
                                            <BookCard key={book.id} book={book} onClick={() => openDetail(book)} />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                /* Virtualized list view */
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
                                    <div className={s.listRow} onClick={() => openDetail(book)}
                                         role="button" tabIndex={0}
                                         onKeyDown={(e) => { if (e.key === 'Enter') openDetail(book); }}>
                                        <img src={book.coverImg || 'https://via.placeholder.com/40x60?text=No'}
                                             alt={book.title} className={s.listCover} />
                                        <div className={s.listInfo}>
                                            <div className={s.listTitle}>{book.title}</div>
                                            <div className={s.listAuthor}>{book.author}</div>
                                        </div>
                                        <span className={s.listStatus}
                                            style={{
                                                color: statusColors[book.status] || 'var(--text-muted)',
                                                background: `${statusColors[book.status] || 'var(--text-muted)'}20`,
                                            }}>
                                            {book.status.replace('-', ' ')}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Book detail modal */}
            {freshSelectedBook && (
                <BookDetail book={freshSelectedBook} onClose={closeDetail} />
            )}
        </div>
    );
};

export default LibraryList;
