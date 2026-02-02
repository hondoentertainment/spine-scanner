import React, { useState } from 'react';
import { useBookStore } from '../store/useBookStore.ts';
import BookCard from './BookCard.tsx';
import { Search, Settings } from 'lucide-react';

interface LibraryListProps {
    onManageData?: () => void;
}

const LibraryList: React.FC<LibraryListProps> = ({ onManageData }) => {
    const { books } = useBookStore();
    const [searchTerm, setSearchTerm] = useState('');

    const filteredBooks = books.filter(book =>
        book.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        book.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
        book.isbn.includes(searchTerm)
    );

    return (
        <div style={{ marginTop: '3rem' }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '2rem',
                flexWrap: 'wrap',
                gap: '1rem'
            }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Your Library ({books.length})</h2>

                <div style={{ display: 'flex', gap: '1rem', flex: 1, maxWidth: '600px' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
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
                            style={{
                                width: '100%',
                                padding: '0.75rem 0.75rem 0.75rem 2.5rem',
                                border: 'none',
                                color: 'white',
                                fontSize: '0.875rem'
                            }}
                        />
                    </div>

                    <button
                        onClick={onManageData}
                        className="glass"
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

            {filteredBooks.length === 0 ? (
                <div style={{
                    padding: '4rem',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: '1rem',
                    border: '1px dashed var(--glass-border)'
                }}>
                    {searchTerm ? 'No books match your search.' : 'Your library is empty. Scan a book to get started!'}
                </div>
            ) : (
                <div className="book-grid">
                    {filteredBooks.map((book) => (
                        <BookCard key={book.id} book={book} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default LibraryList;
