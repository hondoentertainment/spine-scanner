import React, { useState } from 'react';
import { useBookStore } from '../store/useBookStore.ts';
import { useToast } from './Toast.tsx';
import type { BookEntry } from '../types.ts';
import { generateAmazonLink } from '../utils/amazonLink.ts';
import { shareBook } from '../utils/shareBook.ts';
import { isBookPhotoOnly } from '../utils/libraryUtils.ts';
import {
  X, ExternalLink, BookOpen, CheckCircle, Clock, XCircle,
  Pencil, Save, Tag, Trash2, Share2
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
  const { updateBook, updateBookStatus, updateBookNotes, removeBook, shelves, assignShelf, unassignShelf } = useBookStore();
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
  const bookShelves = shelves.filter((s) => bookShelfIds.includes(s.id));
  const availableShelves = shelves.filter((s) => !bookShelfIds.includes(s.id));

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
      toast('Book removed', 'info');
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
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
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
