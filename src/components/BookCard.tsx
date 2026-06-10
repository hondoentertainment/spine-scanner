import React, { useState, useEffect, useRef } from 'react';
import { useBookStore } from '../store/useBookStore.ts';
import { useReadingSessionStore } from '../store/useReadingSessionStore.ts';
import { useToast } from './Toast.tsx';
import type { BookEntry } from '../types.ts';
import { Trash2, ExternalLink, BookOpen, CheckCircle, Clock, XCircle, Pencil, X, Save, Tag, Share2, Square, Play } from 'lucide-react';
import { generateAmazonLink } from '../utils/amazonLink.ts';
import { shareBook } from '../utils/shareBook.ts';
import { getBookCoverSrc } from '../utils/bookPresentation.ts';
import { getReadingProgressPercent } from '../utils/bookState.ts';
import s from './BookCard.module.css';

export interface BookCardProps {
    book: BookEntry;
    /** @deprecated Prefer `onActivateBookId` so the card can memoize without new closures per row. */
    onClick?: () => void;
    /** Stable handler — avoids per-row inline lambdas in virtualized lists. */
    onActivateBookId?: (id: string) => void;
}

function bookVisualEqual(a: BookEntry, b: BookEntry): boolean {
    return (
        a.id === b.id
        && a.title === b.title
        && a.author === b.author
        && a.status === b.status
        && a.coverImg === b.coverImg
        && a.notes === b.notes
        && a.pageCount === b.pageCount
        && (a.pagesFinished ?? 0) === (b.pagesFinished ?? 0)
        && a.isbn === b.isbn
        && a.needsReview === b.needsReview
        && (a.shelfIds?.join(',') ?? '') === (b.shelfIds?.join(',') ?? '')
    );
}

const BookCardInner: React.FC<BookCardProps> = ({ book, onClick, onActivateBookId }) => {
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
    const { activeBookId, startSession, stopSession, cancelSession } = useReadingSessionStore();
    const { toast, confirm } = useToast();
    const shelfAnchorRef = useRef<HTMLDivElement>(null);
    const shelfTriggerRef = useRef<HTMLButtonElement>(null);
    const [editing, setEditing] = useState(false);
    const [showShelfPicker, setShowShelfPicker] = useState(false);
    const [showStopForm, setShowStopForm] = useState(false);
    const [stopPages, setStopPages] = useState(0);
    const [elapsedLabel, setElapsedLabel] = useState('');

    useEffect(() => {
      if (activeBookId !== book.id) return;
      const activeStartMs = useReadingSessionStore.getState().activeStartMs;
      if (activeStartMs === null) return;
      const update = () => {
        const mins = Math.floor((Date.now() - activeStartMs) / 60000);
        setElapsedLabel(`${mins}m`);
      };
      update();
      const id = setInterval(update, 30000);
      return () => clearInterval(id);
    }, [activeBookId, book.id]);

    useEffect(() => {
        if (!showShelfPicker) return;
        const onPointerDown = (ev: MouseEvent) => {
            if (shelfAnchorRef.current?.contains(ev.target as Node)) return;
            setShowShelfPicker(false);
        };
        const onKey = (ev: KeyboardEvent) => {
            if (ev.key === 'Escape') {
                setShowShelfPicker(false);
                shelfTriggerRef.current?.focus();
            }
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [showShelfPicker]);
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

    const openCard = () => {
        if (onActivateBookId) onActivateBookId(book.id);
        else onClick?.();
    };

    const statusChips: { status: BookEntry['status']; icon: React.ReactNode; label: string }[] = [
        { status: 'to-read', icon: <Clock size={14} />, label: 'To Read' },
        { status: 'reading', icon: <BookOpen size={14} />, label: 'Reading' },
        { status: 'read', icon: <CheckCircle size={14} />, label: 'Read' },
        { status: 'dnf', icon: <XCircle size={14} />, label: 'DNF' },
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
        <div
            className={`book-card glass ${s.card}`}
            onClick={openCard}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openCard();
                }
            }}
        >
            <div className={s.cardInner}>
                <img
                    src={getBookCoverSrc(book.coverImg)}
                    alt={book.title}
                    className={s.coverImg}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                />
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
                    <div ref={shelfAnchorRef} className={s.shelfPickerWrap}>
                        <button
                            ref={shelfTriggerRef}
                            type="button"
                            onClick={() => setShowShelfPicker(!showShelfPicker)}
                            aria-label="Add to shelf"
                            aria-expanded={showShelfPicker}
                            className={s.shelfPickerBtn}
                        >
                            <Tag size={10} /> +
                        </button>
                        {showShelfPicker && availableShelves.length > 0 && (
                            <div className={s.shelfPickerDrop} role="listbox" aria-label="Choose shelf">
                                {availableShelves.map((shelf) => (
                                    <button
                                        key={shelf.id}
                                        type="button"
                                        onClick={() => { assignShelf(book.id, shelf.id); setShowShelfPicker(false); }}
                                        className={s.shelfPickerItem}
                                        style={{ color: shelf.color }}
                                    >
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

            {(book.status === 'reading' || activeBookId === book.id) && (
              <div className={s.sessionRow} onClick={(e) => e.stopPropagation()}>
                {activeBookId === book.id ? (
                  showStopForm ? (
                    <div className={s.stopForm}>
                      <input
                        type="number"
                        min={0}
                        value={stopPages}
                        onChange={(e) => setStopPages(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className={s.stopInput}
                        placeholder="Pages read"
                        autoFocus
                      />
                      <button
                        type="button"
                        className={s.stopConfirmBtn}
                        onClick={() => {
                          stopSession(book.id, stopPages);
                          setShowStopForm(false);
                          setStopPages(0);
                          toast('Session logged', 'success');
                        }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className={s.cancelBtn}
                        onClick={() => { cancelSession(); setShowStopForm(false); setStopPages(0); }}
                      >
                        Discard
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={s.stopBtn}
                      onClick={() => setShowStopForm(true)}
                    >
                      <Square size={12} /> Stop {elapsedLabel && <span className={s.elapsed}>{elapsedLabel}</span>}
                    </button>
                  )
                ) : activeBookId !== null ? (
                  <button type="button" className={s.startBtn} disabled title="Another session is active">
                    <Play size={12} /> Start session
                  </button>
                ) : (
                  <button
                    type="button"
                    className={s.startBtn}
                    onClick={() => startSession(book.id)}
                  >
                    <Play size={12} /> Start session
                  </button>
                )}
              </div>
            )}

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

const BookCard = React.memo(BookCardInner, (prev, next) => {
    if (prev.onClick !== next.onClick) return false;
    if (prev.onActivateBookId !== next.onActivateBookId) return false;
    return bookVisualEqual(prev.book, next.book);
});

export default BookCard;
