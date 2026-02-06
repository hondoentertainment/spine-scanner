import React, { useState, useMemo } from 'react';
import { useBookStore } from '../store/useBookStore.ts';
import BookCard from './BookCard.tsx';
import { Search, Settings, ArrowUpDown, Filter, BookOpen, Clock, CheckCircle, XCircle, BarChart3 } from 'lucide-react';
import type { BookEntry } from '../types.ts';

type SortField = 'title' | 'author' | 'dateAdded' | 'pageCount';
type StatusFilter = BookEntry['status'] | 'all';

interface LibraryListProps {
    onManageData?: () => void;
}

const LibraryList: React.FC<LibraryListProps> = ({ onManageData }) => {
    const { books } = useBookStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState<SortField>('dateAdded');
    const [sortAsc, setSortAsc] = useState(false);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [showStats, setShowStats] = useState(false);

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

        if (statusFilter !== 'all') {
            result = result.filter(b => b.status === statusFilter);
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
    }, [books, searchTerm, statusFilter, sortBy, sortAsc]);

    const handleSortToggle = (field: SortField) => {
        if (sortBy === field) {
            setSortAsc(!sortAsc);
        } else {
            setSortBy(field);
            setSortAsc(field === 'title' || field === 'author');
        }
    };

    const statusFilters: { value: StatusFilter; label: string; icon: React.ReactNode; color: string }[] = [
        { value: 'all', label: 'All', icon: null, color: 'var(--text-muted)' },
        { value: 'to-read', label: 'To Read', icon: <Clock size={14} />, color: '#38bdf8' },
        { value: 'reading', label: 'Reading', icon: <BookOpen size={14} />, color: '#a855f7' },
        { value: 'read', label: 'Read', icon: <CheckCircle size={14} />, color: '#22c55e' },
        { value: 'dnf', label: 'DNF', icon: <XCircle size={14} />, color: '#ef4444' },
    ];

    return (
        <div style={{ marginTop: '3rem' }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
                flexWrap: 'wrap',
                gap: '1rem'
            }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Your Library ({books.length})</h2>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={() => setShowStats(!showStats)}
                        className="glass"
                        aria-label="Toggle reading statistics"
                        style={{
                            padding: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            color: showStats ? 'var(--accent-blue)' : 'var(--text-muted)',
                            background: showStats ? 'rgba(56, 189, 248, 0.1)' : undefined,
                        }}
                    >
                        <BarChart3 size={20} />
                    </button>
                    <button
                        onClick={onManageData}
                        className="glass"
                        aria-label="Manage library data"
                        style={{
                            padding: '0.75rem 1rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            color: 'var(--accent-blue)',
                            background: 'rgba(56, 189, 248, 0.1)'
                        }}
                    >
                        <Settings size={20} />
                    </button>
                </div>
            </div>

            {showStats && (
                <div className="glass" style={{ padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
                    <div style={{ textAlign: 'center', minWidth: '80px' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.total}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Books</div>
                    </div>
                    <div style={{ textAlign: 'center', minWidth: '80px' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#22c55e' }}>{stats.read}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Read</div>
                    </div>
                    <div style={{ textAlign: 'center', minWidth: '80px' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#a855f7' }}>{stats.reading}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Reading</div>
                    </div>
                    <div style={{ textAlign: 'center', minWidth: '80px' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#38bdf8' }}>{stats.toRead}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>To Read</div>
                    </div>
                    <div style={{ textAlign: 'center', minWidth: '80px' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.readPages.toLocaleString()}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pages Read</div>
                    </div>
                    <div style={{ textAlign: 'center', minWidth: '80px' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.totalPages.toLocaleString()}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Pages</div>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                    <Search
                        size={18}
                        style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                    />
                    <input
                        type="text"
                        placeholder="Search library..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="glass"
                        aria-label="Search library"
                        style={{
                            width: '100%',
                            padding: '0.75rem 0.75rem 0.75rem 2.5rem',
                            border: 'none',
                            color: 'white',
                            fontSize: '0.875rem'
                        }}
                    />
                </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <Filter size={16} style={{ color: 'var(--text-muted)' }} />
                {statusFilters.map(f => (
                    <button
                        key={f.value}
                        onClick={() => setStatusFilter(f.value)}
                        className="glass"
                        style={{
                            padding: '0.4rem 0.75rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            color: statusFilter === f.value ? f.color : 'var(--text-muted)',
                            background: statusFilter === f.value ? `${f.color}20` : undefined,
                            borderRadius: '9999px',
                        }}
                    >
                        {f.icon} {f.label}
                        {f.value !== 'all' && (
                            <span style={{ opacity: 0.7 }}>
                                ({f.value === 'to-read' ? stats.toRead : f.value === 'reading' ? stats.reading : f.value === 'read' ? stats.read : stats.dnf})
                            </span>
                        )}
                    </button>
                ))}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <ArrowUpDown size={16} style={{ color: 'var(--text-muted)' }} />
                {([
                    ['dateAdded', 'Date'],
                    ['title', 'Title'],
                    ['author', 'Author'],
                    ['pageCount', 'Pages'],
                ] as [SortField, string][]).map(([field, label]) => (
                    <button
                        key={field}
                        onClick={() => handleSortToggle(field)}
                        className="glass"
                        style={{
                            padding: '0.35rem 0.65rem',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: sortBy === field ? 'var(--accent-blue)' : 'var(--text-muted)',
                            background: sortBy === field ? 'rgba(56, 189, 248, 0.1)' : undefined,
                            borderRadius: '9999px',
                        }}
                    >
                        {label} {sortBy === field && (sortAsc ? '\u2191' : '\u2193')}
                    </button>
                ))}
            </div>

            {filteredAndSorted.length === 0 ? (
                <div style={{
                    padding: '4rem',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: '1rem',
                    border: '1px dashed var(--glass-border)'
                }}>
                    {searchTerm || statusFilter !== 'all' ? 'No books match your filters.' : 'Your library is empty. Scan a book to get started!'}
                </div>
            ) : (
                <div className="book-grid">
                    {filteredAndSorted.map((book) => (
                        <BookCard key={book.id} book={book} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default LibraryList;
