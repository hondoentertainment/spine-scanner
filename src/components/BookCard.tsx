import React, { useState } from 'react';
import { useBookStore } from '../store/useBookStore.ts';
import { useToast } from './Toast.tsx';
import type { BookEntry } from '../types.ts';
import { Trash2, ExternalLink, BookOpen, CheckCircle, Clock, XCircle, Pencil, X, Save, Tag, Share2 } from 'lucide-react';
import { generateAmazonLink } from '../utils/amazonLink.ts';
import { shareBook } from '../utils/shareBook.ts';
import { getReadingProgressPercent } from '../utils/bookState.ts';
import ProgressRing from './ProgressRing.tsx';
import s from './BookCard.module.css';

interface BookCardProps {
    book: BookEntry;
    onClick?: () => void;
}

const BookCard: React.FC<BookCardProps> = ({ book, onClick }) => {
    const {
        updateBook,
        updateBookStatus,
        updateBookNotes,
        updateReadingProgress,
        markNeedsReview,
        removeBook,
        shelves,
        assignShelf,
        unassignShelf,
    } = useBookStore();
    const { toast, confirm } = useToast();
    const [editing, setEditing] = useState(false);
    const [showShelfPicker, setShowShelfPicker] = useState(false);
    const [draft, setDraft] = useState({
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        pageCount: book.pageCount,
        coverImg: book.coverImg,
    });

    const bookShelfIds = book.shelfIds || [];
    const bookShelves = shelves.filter((sh) => bookShelfIds.includes(sh.id));
    const availableShelves = shelves.filter((sh) => !bookShelfIds.includes(sh.id));
    const progressPercent = getReadingProgressPercent(book);
    const progressValue = Math.min(book.pageCount || 0, book.pagesFinished || 0);

    const statusChips: { status: BookEntry['status']; icon: React.ReactNode; label: string }[] = [
        { status: 'to-read', icon: <Clock size={11} />, label: 'To Read' },
        { status: 'reading', icon: <BookOpen size={11} />, label: 'Reading' },
        { status: 'read', icon: <CheckCircle size={11} />, label: 'Read' },
        { status: 'dnf', icon: <XCircle size={11} />, label: 'DNF' },
    ];

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setDraft({
            title: book.title,
            author: book.author,
            isbn: book.isbn,
            pageCount: book.pageCount,
            coverImg: book.coverImg,
        });
        setEditing(true);
    };

    const handleSave = () => {
        updateBook(book.id, {
            title: draft.title.trim() || book.title,
            author: draft.author.trim() || book.author,
            isbn: draft.isbn.trim() || book.isbn,
            pageCount: draft.pageCount || 0,
            coverImg: draft.coverImg.trim(),
            amazonLink: generateAmazonLink(draft.isbn.trim() || book.isbn),
        });
        setEditing(false);
        toast('Book updated', 'success');
    };

    const handleCancel = () => setEditing(false);

    const handleRemove = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const yes = await confirm({
            title: 'Remove Book',
            message: `Remove "${book.title}" from your library?`,
            confirmLabel: 'Remove',
            danger: true,
        });
        if (yes) {
            removeBook(book.id);
            toast('Book removed', 'info');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
        if (e.key === 'Escape') handleCancel();
    };

    if (editing) {
        return (
            <div className={`book-card glass ${s.card}`}>
                <div className={s.editHeader}>
                    <span className={s.editLabel}>Edit Book</span>
                    <div className={s.editBtnGroup}>
                        <button onClick={handleSave} aria-label="Save changes" className={s.saveBtn}>
                            <Save size={14} /> Save
                        </button>
                        <button onClick={handleCancel} aria-label="Cancel editing" className={s.cancelBtn}>
                            <X size={14} /> Cancel
                        </button>
                    </div>
                </div>

                <div className={s.editForm} onKeyDown={handleKeyDown}>
                    <div>
                        <div className={s.fieldLabel}>Title</div>
                        <input className={s.input} type="text" value={draft.title}
                            onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus />
                    </div>
                    <div>
                        <div className={s.fieldLabel}>Author</div>
                        <input className={s.input} type="text" value={draft.author}
                            onChange={(e) => setDraft({ ...draft, author: e.target.value })} />
                    </div>
                    <div className={s.isbnRow}>
                        <div style={{ flex: 1 }}>
                            <div className={s.fieldLabel}>ISBN</div>
                            <input className={s.input} type="text" value={draft.isbn}
                                onChange={(e) => setDraft({ ...draft, isbn: e.target.value })} />
                        </div>
                        <div style={{ width: '90px' }}>
                            <div className={s.fieldLabel}>Pages</div>
                            <input className={s.input} type="number" value={draft.pageCount || ''}
                                onChange={(e) => setDraft({ ...draft, pageCount: parseInt(e.target.value) || 0 })} min={0} />
                        </div>
                    </div>
                    <div>
                        <div className={s.fieldLabel}>Cover Image URL</div>
                        <input className={s.input} type="url" value={draft.coverImg}
                            onChange={(e) => setDraft({ ...draft, coverImg: e.target.value })} placeholder="https://..." />
                    </div>
                    {draft.coverImg && (
                        <div className={s.coverPreview}>
                            <img src={draft.coverImg} alt="Cover preview" className={s.coverPreviewImg}
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className={`book-card glass ${s.card}`} onClick={onClick} role="button" tabIndex={0}
             onKeyDown={(e) => { if (e.key === 'Enter') onClick?.(); }}>
            <div className={s.cardInner}>
                {book.coverImg?.trim() ? (
                    <img
                        src={book.coverImg}
                        alt={book.title}
                        className={s.coverImg}
                    />
                ) : (
                    <div className={`cover-fallback ${s.coverImg}`}>
                        <BookOpen size={24} />
                        <span className="cover-fallback-title">{book.title}</span>
                    </div>
                )}
                <div className={s.info}>
                    <h3 className={s.bookTitle}>{book.title}</h3>
                    <p className={s.bookAuthor}>{book.author}</p>
                    <div className={s.links}>
                        {generateAmazonLink(book.isbn) && (
                            <a href={generateAmazonLink(book.isbn)} target="_blank" rel="noopener noreferrer"
                               className={`glass ${s.amazonBtn}`} onClick={(e) => e.stopPropagation()}>
                                <ExternalLink size={12} /> Amazon
                            </a>
                        )}
                        <button type="button" onClick={async (e) => {
                            e.stopPropagation();
                            const ok = await shareBook(book.isbn, book.title, book.author, () => toast('Link copied to clipboard', 'success'));
                            if (!ok) toast('Could not share', 'error');
                        }} className={`glass ${s.amazonBtn}`}
                            aria-label={`Share ${book.title}`} title="Share book">
                            <Share2 size={12} /> Share
                        </button>
                    </div>
                </div>
                <ProgressRing percent={progressPercent} size={40} />
            </div>

            {/* Shelf chips */}
            <div className={s.shelfRow} onClick={(e) => e.stopPropagation()}>
                {bookShelves.map((shelf) => (
                    <span key={shelf.id} className={s.shelfChip}
                          style={{ background: `${shelf.color}20`, color: shelf.color }}>
                        {shelf.name}
                        <button onClick={() => unassignShelf(book.id, shelf.id)}
                                aria-label={`Remove from ${shelf.name}`}
                                className={s.chipRemove} style={{ color: shelf.color }}>
                            <X size={10} />
                        </button>
                    </span>
                ))}
                {shelves.length > 0 && (
                    <div className={s.shelfPickerWrap}>
                        <button onClick={() => setShowShelfPicker(!showShelfPicker)}
                                aria-label="Add to shelf" className={s.shelfPickerBtn}>
                            <Tag size={10} /> +
                        </button>
                        {showShelfPicker && availableShelves.length > 0 && (
                            <div className={s.shelfPickerDrop}>
                                {availableShelves.map((shelf) => (
                                    <button key={shelf.id}
                                        onClick={() => { assignShelf(book.id, shelf.id); setShowShelfPicker(false); }}
                                        className={s.shelfPickerItem} style={{ color: shelf.color }}>
                                        <span className={s.shelfDot} style={{ background: shelf.color }} />
                                        {shelf.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className={s.statusRow} onClick={(e) => e.stopPropagation()}>
                {statusChips.map(({ status, icon, label }) => (
                    <button key={status} onClick={() => updateBookStatus(book.id, status)}
                        className={`status-badge ${book.status === status ? `status-${status}` : ''} ${s.statusBtn}`}
                        title={label} aria-label={`Set status to ${label}`}>
                        {icon}
                    </button>
                ))}
            </div>

            <div className={s.progressBlock} onClick={(e) => e.stopPropagation()}>
                <div className={s.progressHeader}>
                    <span>Progress</span>
                    <span>{progressPercent}%</span>
                </div>
                <div className={s.progressTrack}>
                    <span className={s.progressFill} style={{ width: `${progressPercent}%` }} />
                </div>
                <div className={s.quickActions}>
                    <button type="button" className={s.quickBtn} onClick={() => updateBookStatus(book.id, 'reading')}>
                        Start
                    </button>
                    <button
                        type="button"
                        className={s.quickBtn}
                        onClick={() => updateReadingProgress(book.id, progressValue + 25)}
                    >
                        +25 pages
                    </button>
                    <button type="button" className={s.quickBtn} onClick={() => updateBookStatus(book.id, 'read')}>
                        Finish
                    </button>
                    {book.needsReview && (
                        <button type="button" className={s.quickBtn} onClick={() => markNeedsReview(book.id, false)}>
                            Resolve review
                        </button>
                    )}
                </div>
            </div>

            <textarea placeholder="Add your notes or quotes..." value={book.notes}
                onChange={(e) => updateBookNotes(book.id, e.target.value)}
                className={`glass ${s.notes}`}
                onClick={(e) => e.stopPropagation()} />

            <div className={s.actionsRow} onClick={(e) => e.stopPropagation()}>
                <button onClick={handleEdit} aria-label={`Edit ${book.title}`} className={s.editBtn}>
                    <Pencil size={14} /> Edit
                </button>
                <button onClick={handleRemove} aria-label={`Remove ${book.title} from library`} className={s.removeBtn}>
                    <Trash2 size={14} /> Remove
                </button>
            </div>
        </div>
    );
};

export default BookCard;
