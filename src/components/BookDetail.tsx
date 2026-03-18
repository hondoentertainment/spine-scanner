import React, { useState } from 'react';
import { useBookStore } from '../store/useBookStore.ts';
import { useBookLookup } from '../hooks/useBookLookup.ts';
import { useToast } from './Toast.tsx';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';
import type { BookEntry, UserEditableField } from '../types.ts';
import { generateAmazonLink } from '../utils/amazonLink.ts';
import { shareBook } from '../utils/shareBook.ts';
import { isBookPhotoOnly } from '../utils/libraryUtils.ts';
import {
  X, ExternalLink, BookOpen, CheckCircle, Clock, XCircle,
  Pencil, Save, Tag, Trash2, Share2, RefreshCw
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

const sourceLabels: Record<string, string> = {
  google_books: 'Google Books',
  open_library: 'Open Library',
  manual: 'Manual entry',
  photo: 'Photo only',
};

const EDITABLE_FIELDS: UserEditableField[] = ['title', 'author', 'pageCount', 'coverImg'];

const BookDetail: React.FC<BookDetailProps> = ({ book, onClose }) => {
  const { updateBook, updateBookStatus, updateBookNotes, removeBook, shelves, assignShelf, unassignShelf } = useBookStore();
  const { lookupByIsbn, loading: refreshing } = useBookLookup();
  const { toast, confirm } = useToast();
  const focusTrapRef = useFocusTrap<HTMLDivElement>();
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
    // Determine which fields the user actually changed
    const changed: UserEditableField[] = [];
    if (draft.title.trim() && draft.title.trim() !== book.title) changed.push('title');
    if (draft.author.trim() && draft.author.trim() !== book.author) changed.push('author');
    if (draft.pageCount !== book.pageCount) changed.push('pageCount');
    if (draft.coverImg.trim() !== book.coverImg) changed.push('coverImg');

    const existingEdited = book.userEditedFields ?? [];
    const merged = Array.from(new Set([...existingEdited, ...changed])) as UserEditableField[];

    updateBook(book.id, {
      title: draft.title.trim() || book.title,
      author: draft.author.trim() || book.author,
      isbn: draft.isbn.trim() || book.isbn,
      pageCount: draft.pageCount || 0,
      coverImg: draft.coverImg.trim(),
      amazonLink: generateAmazonLink(draft.isbn.trim() || book.isbn),
      metadataSource: 'manual',
      userEditedFields: merged.length > 0 ? merged : existingEdited,
    });
    setEditing(false);
    toast('Book updated', 'success');
  };

  const handleCancel = () => setEditing(false);

  const handleRefreshMetadata = async () => {
    if (isBookPhotoOnly(book)) {
      toast('Photo-only books cannot be refreshed via ISBN lookup', 'info');
      return;
    }
    const freshData = await lookupByIsbn(book.isbn);
    if (!freshData) {
      toast('Could not find updated metadata for this ISBN', 'error');
      return;
    }

    const protected_ = book.userEditedFields ?? [];
    const updates: Partial<Omit<BookEntry, 'id'>> = {
      metadataSource: freshData.source,
    };
    if (!protected_.includes('title')) updates.title = freshData.title;
    if (!protected_.includes('author')) updates.author = freshData.authors.join(', ');
    if (!protected_.includes('pageCount') && freshData.pageCount > 0) updates.pageCount = freshData.pageCount;
    if (!protected_.includes('coverImg') && freshData.thumbnail) updates.coverImg = freshData.thumbnail;

    updateBook(book.id, updates);
    toast('Metadata refreshed', 'success');
  };

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

  const protectedFields = book.userEditedFields ?? [];

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
                <label className={styles.label}>
                  Title {protectedFields.includes('title') && <span className={styles.editedBadge}>edited</span>}
                </label>
                <input
                  className={styles.input}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  autoFocus
                />
                <label className={styles.label}>
                  Author {protectedFields.includes('author') && <span className={styles.editedBadge}>edited</span>}
                </label>
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
                    <label className={styles.label}>
                      Pages {protectedFields.includes('pageCount') && <span className={styles.editedBadge}>edited</span>}
                    </label>
                    <input
                      className={styles.input}
                      type="number"
                      value={draft.pageCount || ''}
                      onChange={(e) => setDraft({ ...draft, pageCount: parseInt(e.target.value) || 0 })}
                      min={0}
                    />
                  </div>
                </div>
                <label className={styles.label}>
                  Cover URL {protectedFields.includes('coverImg') && <span className={styles.editedBadge}>edited</span>}
                </label>
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
                {book.metadataSource && (
                  <div className={styles.sourceBadge}>
                    {sourceLabels[book.metadataSource] ?? book.metadataSource}
                    {protectedFields.length > 0 && (
                      <span className={styles.sourceBadgeEdited}> · {protectedFields.length} field{protectedFields.length > 1 ? 's' : ''} edited</span>
                    )}
                  </div>
                )}
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

        {/* Reading progress */}
        {book.status === 'reading' && (
          <div className={styles.progressPanel}>
            <div className={styles.progressHeader}>
              <span className={styles.progressLabel}>Reading progress</span>
              {book.startedAt && (
                <span className={styles.progressDate}>
                  Started {new Date(book.startedAt).toLocaleDateString()}
                </span>
              )}
            </div>
            <div className={styles.progressInputRow}>
              <input
                type="number"
                min={0}
                max={book.pageCount || undefined}
                value={book.progressPages ?? ''}
                onChange={(e) =>
                  updateBook(book.id, { progressPages: parseInt(e.target.value) || 0 })
                }
                className={styles.progressInput}
                aria-label="Current page"
                placeholder="0"
              />
              {book.pageCount > 0 && (
                <span className={styles.progressOf}>of {book.pageCount} pages</span>
              )}
            </div>
            {book.pageCount > 0 && (book.progressPages ?? 0) > 0 && (
              <div className={styles.progressBarTrack} role="progressbar"
                aria-valuenow={book.progressPages}
                aria-valuemin={0}
                aria-valuemax={book.pageCount}>
                <div
                  className={styles.progressBarFill}
                  style={{ width: `${Math.min(100, ((book.progressPages ?? 0) / book.pageCount) * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}

        {book.status === 'read' && book.finishedAt && (
          <div className={styles.finishedBadge}>
            Finished {new Date(book.finishedAt).toLocaleDateString()}
            {book.startedAt && (() => {
              const days = Math.round(
                (new Date(book.finishedAt!).getTime() - new Date(book.startedAt).getTime()) /
                (1000 * 60 * 60 * 24)
              );
              return days > 0 ? ` · ${days} day${days !== 1 ? 's' : ''}` : null;
            })()}
          </div>
        )}

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
          <div className={styles.actionsLeft}>
            {!editing && (
              <button onClick={handleEdit} className={styles.editBtn}>
                <Pencil size={14} /> Edit Details
              </button>
            )}
            {!editing && !isBookPhotoOnly(book) && (
              <button
                onClick={handleRefreshMetadata}
                className={styles.refreshBtn}
                disabled={refreshing}
                aria-label="Refresh metadata from API"
              >
                <RefreshCw size={14} className={refreshing ? styles.spinning : undefined} />
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            )}
          </div>
          <button onClick={handleRemove} className={styles.removeBtn}>
            <Trash2 size={14} /> Remove
          </button>
        </div>
      </div>
    </div>
  );
};

// Re-export for use in tests
export { EDITABLE_FIELDS };
export default BookDetail;
