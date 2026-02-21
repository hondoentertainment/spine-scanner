import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useBookStore } from '../store/useBookStore.ts';
import BookCard from './BookCard.tsx';
import BookDetail from './BookDetail.tsx';
import ShelfManager from './ShelfManager.tsx';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Search, Settings, ArrowUpDown, Filter, BookOpen, Clock, CheckCircle, XCircle,
  BarChart3, Tag, LayoutGrid, List, Share2
} from 'lucide-react';
import type { BookEntry } from '../types.ts';
import { shareBookList } from '../utils/shareBook.ts';
import { useToast } from './Toast.tsx';
import s from './LibraryList.module.css';

type SortField = 'title' | 'author' | 'dateAdded' | 'pageCount' | 'rating';
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
    const { toast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState<SortField>('dateAdded');
    const [sortAsc, setSortAsc] = useState(false);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [shelfFilter, setShelfFilter] = useState<string | null>(null);
    const [showStats, setShowStats] = useState(false);
    const [showShelves, setShowShelves] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [selectedBook, setSelectedBook] = useState<BookEntry | null>(null);
    const [annualGoal, setAnnualGoal] = useState<number>(() => {
        const stored = localStorage.getItem('spine-scanner-annual-goal');
        return stored ? Math.max(0, parseInt(stored, 10)) : 0;
    });

    const listParentRef = useRef<HTMLDivElement>(null);

    const stats = useMemo(() => {
        const toRead = books.filter(b => b.status === 'to-read').length;
        const reading = books.filter(b => b.status === 'reading').length;
        const read = books.filter(b => b.status === 'read').length;
        const dnf = books.filter(b => b.status === 'dnf').length;
        const totalPages = books.reduce((sum, b) => sum + (b.pageCount || 0), 0);
        const readPages = books.filter(b => b.status === 'read').reduce((sum, b) => sum + (b.pageCount || 0), 0);

        // Avg rating
        const ratedBooks = books.filter(b => b.rating != null);
        const avgRating = ratedBooks.length > 0
            ? ratedBooks.reduce((sum, b) => sum + (b.rating ?? 0), 0) / ratedBooks.length
            : null;

        // Books finished this year (using dateFinished or dateAdded for legacy read books)
        const currentYear = new Date().getFullYear();
        const booksFinishedThisYear = books.filter(b => {
            const dateStr = b.dateFinished ?? (b.status === 'read' ? b.dateAdded : null);
            return dateStr && new Date(dateStr).getFullYear() === currentYear;
        }).length;

        // Avg reading pace in days (books with both dateStarted and dateFinished)
        const paced = books.filter(b => b.dateStarted && b.dateFinished);
        const avgPaceDays = paced.length > 0
            ? paced.reduce((sum, b) => {
                const start = new Date(b.dateStarted!).getTime();
                const end = new Date(b.dateFinished!).getTime();
                return sum + Math.max(1, (end - start) / 86_400_000);
            }, 0) / paced.length
            : null;

        // Monthly finished breakdown for current year (index 0=Jan)
        const monthlyBreakdown = Array.from({ length: 12 }, (_, month) =>
            books.filter(b => {
                const dateStr = b.dateFinished ?? (b.status === 'read' ? b.dateAdded : null);
                if (!dateStr) return false;
                const d = new Date(dateStr);
                return d.getFullYear() === currentYear && d.getMonth() === month;
            }).length
        );

        return { total: books.length, toRead, reading, read, dnf, totalPages, readPages, avgRating, booksFinishedThisYear, avgPaceDays, monthlyBreakdown };
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
                case 'rating': cmp = (a.rating ?? 0) - (b.rating ?? 0); break;
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

    const handleSortToggle = (field: SortField) => {
        if (sortBy === field) setSortAsc(!sortAsc);
        else { setSortBy(field); setSortAsc(field === 'title' || field === 'author'); }
    };

    const handleGoalChange = (val: number) => {
        const clamped = Math.max(0, val);
        setAnnualGoal(clamped);
        localStorage.setItem('spine-scanner-annual-goal', String(clamped));
    };

    const handleCopyList = useCallback(async () => {
        const listTitle = shelfFilter
            ? `${shelves.find(sh => sh.id === shelfFilter)?.name ?? 'Shelf'} (${filteredAndSorted.length} books)`
            : statusFilter !== 'all'
            ? `${statusFilter.replace('-', ' ')} (${filteredAndSorted.length} books)`
            : `My Library (${filteredAndSorted.length} books)`;
        const ok = await shareBookList(filteredAndSorted, listTitle, () => toast('Reading list copied to clipboard', 'success'));
        if (!ok) toast('Could not share list', 'error');
    }, [filteredAndSorted, shelfFilter, statusFilter, shelves, toast]);

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
                        aria-pressed={showStats}
                        style={{
                            color: showStats ? 'var(--accent-blue)' : 'var(--text-muted)',
                            background: showStats ? 'rgba(56, 189, 248, 0.1)' : undefined,
                        }}>
                        <BarChart3 size={20} />
                    </button>
                    <button onClick={handleCopyList} className={`glass ${s.iconBtn}`}
                        aria-label="Share / copy reading list"
                        title="Share or copy reading list">
                        <Share2 size={20} />
                    </button>
                    <button onClick={onManageData} className={`glass ${s.manageBtn}`} aria-label="Manage library data">
                        <Settings size={20} />
                    </button>
                </div>
            </div>

            {showShelves && <ShelfManager />}

            {showStats && (
                <div className={`glass ${s.stats}`}>
                    {/* Core counts */}
                    {[
                        { value: stats.total, label: 'Total Books' },
                        { value: stats.read, label: 'Read', color: '#22c55e' },
                        { value: stats.reading, label: 'Reading', color: '#a855f7' },
                        { value: stats.toRead, label: 'To Read', color: '#38bdf8' },
                        { value: stats.readPages.toLocaleString(), label: 'Pages Read' },
                        { value: stats.totalPages.toLocaleString(), label: 'Total Pages' },
                        ...(stats.avgRating != null ? [{ value: `${stats.avgRating.toFixed(1)} ★`, label: 'Avg Rating', color: '#f59e0b' }] : []),
                        ...(stats.avgPaceDays != null ? [{ value: `${Math.round(stats.avgPaceDays)}d`, label: 'Avg Pace' }] : []),
                    ].map((item) => (
                        <div key={item.label} className={s.statItem}>
                            <div className={s.statValue} style={item.color ? { color: item.color } : undefined}>{item.value}</div>
                            <div className={s.statLabel}>{item.label}</div>
                        </div>
                    ))}

                    {/* Annual goal */}
                    <div className={s.goalSection}>
                        <span className={s.goalLabel}>{new Date().getFullYear()} goal:</span>
                        <input
                            type="number"
                            className={s.goalInput}
                            value={annualGoal || ''}
                            onChange={(e) => handleGoalChange(parseInt(e.target.value) || 0)}
                            placeholder="0"
                            min={0}
                            aria-label="Annual reading goal (number of books)"
                        />
                        {annualGoal > 0 && (
                            <div className={s.goalProgress}>
                                <div className={s.goalBar}>
                                    <div className={s.goalBarFill} style={{ width: `${Math.min(100, (stats.booksFinishedThisYear / annualGoal) * 100)}%` }} />
                                </div>
                                <div className={s.goalText}>{stats.booksFinishedThisYear} / {annualGoal} books</div>
                            </div>
                        )}
                    </div>

                    {/* Monthly chart */}
                    {stats.monthlyBreakdown.some(n => n > 0) && (
                        <div className={s.monthChart}>
                            <div className={s.monthChartTitle}>Books finished by month ({new Date().getFullYear()})</div>
                            <div className={s.monthBars}>
                                {['J','F','M','A','M','J','J','A','S','O','N','D'].map((abbr, i) => {
                                    const max = Math.max(...stats.monthlyBreakdown, 1);
                                    const pct = (stats.monthlyBreakdown[i] / max) * 100;
                                    return (
                                        <div key={i} className={s.monthBarWrap} title={`${abbr}: ${stats.monthlyBreakdown[i]}`}>
                                            <div className={s.monthBarCount}>{stats.monthlyBreakdown[i] > 0 ? stats.monthlyBreakdown[i] : ''}</div>
                                            <div className={s.monthBar} style={{ height: `${Math.max(2, pct * 0.36)}rem` }} />
                                            <div className={s.monthBarLabel}>{abbr}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
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
                        aria-pressed={statusFilter === f.value}
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
                        aria-pressed={shelfFilter === null}
                        style={{ opacity: shelfFilter === null ? 1 : 0.6 }}>
                        All Shelves
                    </button>
                    {shelves.map(shelf => (
                        <button key={shelf.id}
                            onClick={() => setShelfFilter(shelfFilter === shelf.id ? null : shelf.id)}
                            className={`glass ${s.filterBtn}`}
                            aria-pressed={shelfFilter === shelf.id}
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
                    ['rating', 'Rating'],
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
                <div className="book-grid">
                    {filteredAndSorted.map((book) => (
                        <BookCard key={book.id} book={book} onClick={() => openDetail(book)} />
                    ))}
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
