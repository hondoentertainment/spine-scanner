import React from 'react';
import { useBookStore } from '../store/useBookStore.ts';
import type { BookEntry } from '../types.ts';
import { Trash2, ExternalLink, BookOpen, CheckCircle, Clock, XCircle } from 'lucide-react';
import { generateAmazonLink } from '../utils/amazonLink.ts';

interface BookCardProps {
    book: BookEntry;
}

const BookCard: React.FC<BookCardProps> = ({ book }) => {
    const { updateBookStatus, updateBookNotes, removeBook } = useBookStore();

    const statusIcons = {
        'to-read': <Clock size={16} />,
        'reading': <BookOpen size={16} />,
        'read': <CheckCircle size={16} />,
        'dnf': <XCircle size={16} />,
    };

    return (
        <div className="book-card glass">
            <div style={{ display: 'flex', gap: '1rem' }}>
                <img
                    src={book.coverImg || 'https://via.placeholder.com/128x192?text=No+Cover'}
                    alt={book.title}
                    style={{ width: '80px', height: '120px', borderRadius: '0.5rem', objectFit: 'cover' }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {book.title}
                    </h3>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{book.author}</p>
                    <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                        <a
                            href={generateAmazonLink(book.isbn)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="glass"
                            style={{ padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--accent-blue)' }}
                        >
                            <ExternalLink size={12} /> Amazon
                        </a>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                {(['to-read', 'reading', 'read', 'dnf'] as const).map((s) => (
                    <button
                        key={s}
                        onClick={() => updateBookStatus(book.id, s)}
                        className={`status-badge ${book.status === s ? `status-${s}` : ''}`}
                        style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: book.status === s ? undefined : 'rgba(255,255,255,0.05)',
                            border: 'none',
                            padding: '0.4rem'
                        }}
                        title={s.replace('-', ' ')}
                        aria-label={`Set status to ${s.replace('-', ' ')}`}
                    >
                        {statusIcons[s]}
                    </button>
                ))}
            </div>

            <textarea
                placeholder="Add your notes or quotes..."
                value={book.notes}
                onChange={(e) => updateBookNotes(book.id, e.target.value)}
                className="glass"
                style={{
                    width: '100%',
                    minHeight: '60px',
                    padding: '0.5rem',
                    fontSize: '0.875rem',
                    color: 'var(--text-main)',
                    border: 'none',
                    resize: 'vertical',
                    marginTop: '0.5rem'
                }}
            />

            <button
                onClick={() => removeBook(book.id)}
                aria-label={`Remove ${book.title} from library`}
                style={{
                    marginTop: 'auto',
                    alignSelf: 'flex-end',
                    color: '#f87171',
                    background: 'none',
                    padding: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    fontSize: '0.75rem'
                }}
            >
                <Trash2 size={14} /> Remove
            </button>
        </div>
    );
};

export default BookCard;
