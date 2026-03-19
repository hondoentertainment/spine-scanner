import React, { useState } from 'react';
import { useBookStore } from '../store/useBookStore.ts';
import { useToast } from './Toast.tsx';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';
import type { BookEntry } from '../types.ts';
import { generateAmazonLink } from '../utils/amazonLink.ts';
import { shareBook } from '../utils/shareBook.ts';
import { isBookPhotoOnly } from '../utils/libraryUtils.ts';
import { getSeriesBooks } from '../utils/seriesDetection.ts';
import {
  X, ExternalLink, BookOpen, CheckCircle, Clock, XCircle,
  Pencil, Save, Tag, Trash2, Share2, Send, RotateCcw
} from 'lucide-react';
import styles from './BookDetail.module.css';

interface BookDetailProps {
  book: BookEntry;
  onClose: () => void;
}

const statusLabels: Record<BookEntry['status'], string> = {
  'to-read': 'To Read',
  reading: 'Reading',
  read: 'Read',
  dnf: 'Did Not Finish',
};

const statusIcons: Record<BookEntry['status'], React.ReactNode> = {
  'to-read': <Clock size={16} />,
  reading: <BookOpen size={16} />,
  read: <CheckCircle size={16} />,
  dnf: <XCircle size={16} />,
};

const BookDetail: React.FC<BookDetailProps> = ({ book, onClose }) => {
  const { updateBook, updateBookStatus, updateBookNotes, removeBook, restoreBook, shelves, assignShelf, unassignShelf, books, lendBook, returnBook } = useBookStore();
  const { toast, confirm } = useToast();
  const focusTrapRef = useFocusTrap<HTMLDivElement>();
  const [editing, setEditing] = useState(false);
  const [showShelfPicker, setShowShelfPicker] = useState(false);
  const [showLendForm, setShowLendForm] = useState(false);
  const [lendBorrower, setLendBorrower] = useState('');
  const [lendDue, setLendDue] = useState('');
  const [draft, setDraft] = useState({
    title: book.title,
    author: book.author,
    isbn: book.isbn,
    pageCount: book.pageCount,
    coverImg: book.coverImg,
  });

  const bookShelfIds = book.shelfIds || [];
  const bookShelves = shelves.filter((s) => bookShelfIds.includes(s.id));
  const availableShelves = shelves.filter((s) => !bookShelfIds.includes(s.id));

  const seriesCompanions = book.series
    ? getSeriesBooks(books, book.series).filter((b) => b.id !== book.id)
    : [];

  const handleEdit = () => {
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

  const handleRemove = async () => {
    const yes = await confirm({
      title: 'Remove Book',
      message: `Remove "${book.title}" from your library? This cannot be undone.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (yes) {
      removeBook(book.id);
      onClose();
      toast('Book removed', 'info', 10000, undefined, { label: 'Undo', onClick: () => restoreBook(book.id) });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      if (editing) handleCancel();
      else onClose();
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label={`Details for ${book.title}`}>
      <div ref={focusTrapRef} className={styles.modal} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        {/* Close button */}
        <button onClick={onClose} className={styles.closeBtn} aria-label="Close detail view">
          <X size={20} />
        </button>

        {/* Cover + metadata */}
        <div className={styles.top}>
          <img
            src={book.coverImg || 'https://via.placeholder.com/128x192?text=No+Cover'}
            alt={book.title}
            className={styles.cover}
          />
          <div className={styles.meta}>
            {editing ? (
              <div className={styles.editFields}>
                <label className={styles.label}>Title</label>
                <input
                  className={styles.input}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  autoFocus
                />
                <label className={styles.label}>Author</label>
                <input
                  className={styles.input}
                  value={draft.author}
                  onChange={(e) => setDraft({ ...draft, author: e.target.value })}
                />
                <div className={styles.row}>
                  <div style={{ flex: 1 }}>
                    <label className={styles.label}>ISBN</label>
                    <input
                      className={styles.input}
                      value={draft.isbn}
                      onChange={(e) => setDraft({ ...draft, isbn: e.target.value })}
                    />
                  </div>
                  <div style={{ width: '90px' }}>
                    <label className={styles.label}>Pages</label>
                    <input
                      className={styles.input}
                      type="number"
                      value={draft.pageCount || ''}
                      onChange={(e) => setDraft({ ...draft, pageCount: parseInt(e.target.value) || 0 })}
                      min={0}
                    />
                  </div>
                </div>
                <label className={styles.label}>Cover URL</label>
                <input
                  className={styles.input}
                  type="url"
                  value={draft.coverImg}
                  onChange={(e) => setDraft({ ...draft, coverImg: e.target.value })}
                  placeholder="https://..."
                />
                <div className={styles.editActions}>
                  <button onClick={handleSave} className={styles.saveBtn}>
                    <Save size={14} /> Save
                  </button>
                  <button onClick={handleCancel} className={styles.cancelBtn}>
                    <X size={14} /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 className={styles.title}>{book.title}</h2>
                <p className={styles.author}>{book.author}</p>
                {book.series && (
                  <p className={styles.seriesLine}>
                    Part {book.seriesNumber != null ? book.seriesNumber : '?'} of{' '}
                    <span className={styles.seriesName}>{book.series}</span>
                  </p>
                )}
                {seriesCompanions.length > 0 && (
                  <div className={styles.alsoInSeries}>
                    <span className={styles.alsoInSeriesLabel}>Also in series:</span>
                    {seriesCompanions.map((b) => (
                      <span key={b.id} className={styles.seriesCompanion}>
                        {b.seriesNumber != null ? `#${b.seriesNumber} ` : ''}{b.title}
                      </span>
                    ))}
                  </div>
                )}
                <div className={styles.details}>
                  {!isBookPhotoOnly(book) && <span>ISBN: {book.isbn}</span>}
                  {book.pageCount > 0 && <span>{book.pageCount} pages</span>}
                  <span>Added {new Date(book.dateAdded).toLocaleDateString()}</span>
                </div>
                <div className={styles.linkRow}>
                  {generateAmazonLink(book.isbn) && (
                    <a
                      href={generateAmazonLink(book.isbn)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.amazonLink}
                    >
                      <ExternalLink size={12} /> View on Amazon
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await shareBook(book.isbn, book.title, book.author, () => toast('Link copied to clipboard', 'success'));
                      if (!ok) toast('Could not share', 'error');
                    }}
                    className={styles.shareBtn}
                    aria-label={`Share ${book.title}`}
                  >
                    <Share2 size={12} /> Share
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Status buttons */}
        <div className={styles.statusRow}>
          {(['to-read', 'reading', 'read', 'dnf'] as const).map((s) => (
            <button
              key={s}
              onClick={() => updateBookStatus(book.id, s)}
              className={`${styles.statusBtn} ${book.status === s ? styles[`status_${s.replace('-', '_')}`] : ''}`}
              aria-label={`Set status to ${statusLabels[s]}`}
            >
              {statusIcons[s]}
              <span className={styles.statusLabel}>{statusLabels[s]}</span>
            </button>
          ))}
        </div>

        {/* Shelf chips */}
        <div className={styles.shelves}>
          {bookShelves.map((shelf) => (
            <span key={shelf.id} className={styles.shelfChip} style={{ background: `${shelf.color}20`, color: shelf.color }}>
              {shelf.name}
              <button onClick={() => unassignShelf(book.id, shelf.id)} className={styles.chipRemove} style={{ color: shelf.color }}
                aria-label={`Remove from ${shelf.name}`}>
                <X size={10} />
              </button>
            </span>
          ))}
          {shelves.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowShelfPicker(!showShelfPicker)}
                className={styles.addShelfBtn}
                aria-label="Add to shelf"
              >
                <Tag size={12} /> + Shelf
              </button>
              {showShelfPicker && availableShelves.length > 0 && (
                <div className={styles.shelfPicker}>
                  {availableShelves.map((shelf) => (
                    <button
                      key={shelf.id}
                      onClick={() => { assignShelf(book.id, shelf.id); setShowShelfPicker(false); }}
                      className={styles.shelfOption}
                      style={{ color: shelf.color }}
                      aria-label={`Add to ${shelf.name}`}
                    >
                      <span className={styles.shelfDot} style={{ background: shelf.color }} />
                      {shelf.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Notes */}
        <textarea
          placeholder="Add your notes or quotes..."
          value={book.notes}
          onChange={(e) => updateBookNotes(book.id, e.target.value)}
          className={styles.notes}
        />

        {/* Lending */}
        {book.lentTo ? (
          <div className={`glass ${styles.loanCard}`}>
            <div className={styles.loanHeader}>
              <Send size={14} />
              <span className={styles.loanTitle}>On Loan</span>
              {book.lentDue && new Date(book.lentDue) < new Date() && (
                <span className={styles.overdueTag}>Overdue</span>
              )}
            </div>
            <div className={styles.loanInfo}>
              <span><strong>Borrower:</strong> {book.lentTo}</span>
              {book.lentAt && (
                <span><strong>Lent:</strong> {new Date(book.lentAt).toLocaleDateString()}</span>
              )}
              {book.lentDue && (
                <span><strong>Due:</strong> {new Date(book.lentDue).toLocaleDateString()}</span>
              )}
            </div>
            <button
              className={styles.returnBtn}
              onClick={() => {
                returnBook(book.id);
                toast(`"${book.title}" marked as returned`, 'success');
              }}
            >
              <RotateCcw size={14} /> Mark Returned
            </button>
          </div>
        ) : (
          <div className={styles.lendSection}>
            {!showLendForm ? (
              <button
                className={styles.lendToggleBtn}
                onClick={() => { setShowLendForm(true); setLendBorrower(''); setLendDue(''); }}
              >
                <Send size={14} /> Lend this book
              </button>
            ) : (
              <div className={`glass ${styles.lendForm}`}>
                <div className={styles.lendFormHeader}>
                  <span className={styles.lendFormTitle}>Lend this book</span>
                  <button className={styles.lendCancelBtn} onClick={() => setShowLendForm(false)}>
                    <X size={14} />
                  </button>
                </div>
                <label className={styles.label}>Borrower name</label>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="Who are you lending to?"
                  value={lendBorrower}
                  onChange={(e) => setLendBorrower(e.target.value)}
                  autoFocus
                />
                <label className={styles.label}>Due date (optional)</label>
                <input
                  className={styles.input}
                  type="date"
                  value={lendDue}
                  onChange={(e) => setLendDue(e.target.value)}
                />
                <button
                  className={styles.lendSubmitBtn}
                  disabled={!lendBorrower.trim()}
                  onClick={() => {
                    if (!lendBorrower.trim()) return;
                    lendBook(book.id, lendBorrower.trim(), lendDue ? new Date(lendDue).toISOString() : undefined);
                    setShowLendForm(false);
                    toast(`Lent to ${lendBorrower.trim()}`, 'success');
                  }}
                >
                  <Send size={14} /> Lend
                </button>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          {!editing && (
            <button onClick={handleEdit} className={styles.editBtn}>
              <Pencil size={14} /> Edit Details
            </button>
          )}
          <button onClick={handleRemove} className={styles.removeBtn}>
            <Trash2 size={14} /> Remove
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookDetail;
