import React, { useState, useEffect, useRef } from 'react';
import { useBookStore } from '../store/useBookStore.ts';
import { useToast } from './Toast.tsx';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';
import { useBookLookup } from '../hooks/useBookLookup.ts';
import type { BookEntry, UserEditedFields } from '../types.ts';
import { METADATA_SOURCE_LABEL } from '../types.ts';
import { generateAmazonLink } from '../utils/amazonLink.ts';
import { getBookCoverSrc } from '../utils/bookPresentation.ts';
import { shareBook } from '../utils/shareBook.ts';
import { isBookPhotoOnly } from '../utils/libraryUtils.ts';
import { getReadingProgressPercent } from '../utils/bookState.ts';
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

const BookDetail: React.FC<BookDetailProps> = ({ book, onClose }) => {
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
  const { lookupByIsbn, loading: lookupLoading } = useBookLookup();
  const focusTrapRef = useFocusTrap<HTMLDivElement>();
  const shelfAnchorRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [showShelfPicker, setShowShelfPicker] = useState(false);
  const [draft, setDraft] = useState({
    title: book.title,
    author: book.author,
    isbn: book.isbn,
    pageCount: book.pageCount,
    coverImg: book.coverImg,
    seriesName: book.seriesName ?? '',
    seriesIndex: book.seriesIndex != null ? String(book.seriesIndex) : '',
  });

  const bookShelfIds = book.shelfIds || [];
  const bookShelves = shelves.filter((s) => bookShelfIds.includes(s.id));
  const availableShelves = shelves.filter((s) => !bookShelfIds.includes(s.id));
  const progressPercent = getReadingProgressPercent(book);
  const progressValue = book.pagesFinished || 0;
  const titleInputId = `detail-title-${book.id}`;
  const authorInputId = `detail-author-${book.id}`;
  const isbnInputId = `detail-isbn-${book.id}`;
  const pagesInputId = `detail-pages-${book.id}`;
  const seriesInputId = `detail-series-${book.id}`;
  const seriesIndexInputId = `detail-series-index-${book.id}`;
  const coverInputId = `detail-cover-${book.id}`;
  const notesInputId = `detail-notes-${book.id}`;

  const handleEdit = () => {
    setDraft({
      title: book.title,
      author: book.author,
      isbn: book.isbn,
      pageCount: book.pageCount,
      coverImg: book.coverImg,
      seriesName: book.seriesName ?? '',
      seriesIndex: book.seriesIndex != null ? String(book.seriesIndex) : '',
    });
    setEditing(true);
  };

  const handleSave = () => {
    const idxRaw = draft.seriesIndex.trim();
    const parsedIdx = idxRaw === '' ? undefined : Number(idxRaw);
    const nextTitle = draft.title.trim() || book.title;
    const nextAuthor = draft.author.trim() || book.author;
    const nextPageCount = draft.pageCount || 0;
    const nextCover = draft.coverImg.trim();

    // Mark fields as user-edited so a subsequent metadata refresh leaves them alone.
    const edited: UserEditedFields = { ...(book.userEditedFields ?? {}) };
    if (nextTitle !== book.title) edited.title = true;
    if (nextAuthor !== book.author) edited.author = true;
    if (nextPageCount !== book.pageCount) edited.pageCount = true;
    if (nextCover !== book.coverImg) edited.coverImg = true;

    updateBook(book.id, {
      title: nextTitle,
      author: nextAuthor,
      isbn: draft.isbn.trim() || book.isbn,
      pageCount: nextPageCount,
      coverImg: nextCover,
      amazonLink: generateAmazonLink(draft.isbn.trim() || book.isbn),
      seriesName: draft.seriesName.trim() || undefined,
      seriesIndex: parsedIdx !== undefined && Number.isFinite(parsedIdx) ? parsedIdx : undefined,
      userEditedFields: edited,
    });
    setEditing(false);
    toast('Book updated', 'success');
  };

  const handleRefreshMetadata = async () => {
    if (isBookPhotoOnly(book)) {
      toast('Photo-only entries have no ISBN to refresh.', 'info');
      return;
    }
    const meta = await lookupByIsbn(book.isbn);
    if (!meta) {
      toast('No metadata found for that ISBN.', 'error');
      return;
    }
    const edited = book.userEditedFields ?? {};
    const updates: Partial<BookEntry> = { metadataSource: meta.source };
    const reviewReasons: string[] = [];
    if (!edited.title && meta.title) updates.title = meta.title;
    if (!edited.author && meta.authors.length) updates.author = meta.authors.join(', ');
    if (!edited.pageCount && meta.pageCount) updates.pageCount = meta.pageCount;
    if (!edited.coverImg && meta.thumbnail) updates.coverImg = meta.thumbnail;
    if (meta.editionFallback) {
      reviewReasons.push(`Matched alternate ISBN edition ${meta.matchedIsbn}.`);
    }
    if (meta.conflicts?.length) {
      const fields = [...new Set(meta.conflicts.flatMap((conflict) => conflict.reasons))].join(', ');
      reviewReasons.push(`Metadata providers disagree on ${fields}.`);
    }
    if (!updates.coverImg && !book.coverImg) {
      reviewReasons.push('No cover image found.');
    }
    if (reviewReasons.length > 0) {
      updates.needsReview = true;
      updates.reviewReason = reviewReasons.join(' ');
    }
    updateBook(book.id, updates);
    const protectedFields = (Object.keys(edited) as (keyof UserEditedFields)[]).filter(k => edited[k]);
    if (meta.conflicts?.length) {
      toast(`Metadata refreshed from ${METADATA_SOURCE_LABEL[meta.source]}, but providers disagree. Marked for review.`, 'warning');
    } else if (protectedFields.length > 0) {
      toast(`Metadata refreshed from ${METADATA_SOURCE_LABEL[meta.source]}. Kept your edits to: ${protectedFields.join(', ')}.`, 'success');
    } else {
      toast(`Metadata refreshed from ${METADATA_SOURCE_LABEL[meta.source]}.`, 'success');
    }
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

  useEffect(() => {
    if (!showShelfPicker) return;
    const onPointerDown = (ev: MouseEvent) => {
      if (shelfAnchorRef.current?.contains(ev.target as Node)) return;
      setShowShelfPicker(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [showShelfPicker]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      if (showShelfPicker) {
        e.stopPropagation();
        setShowShelfPicker(false);
        return;
      }
      if (editing) handleCancel();
      else onClose();
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label={`Details for ${book.title}`}>
      <div ref={focusTrapRef} className={styles.modal} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <button onClick={onClose} className={styles.closeBtn} aria-label="Close detail view">
          <X size={20} />
        </button>

        <div className={styles.scrollBody}>
          {editing ? (
            <div className={styles.editTop}>
              <img
                src={getBookCoverSrc(book.coverImg)}
                alt=""
                className={styles.coverSmall}
              />
              <div className={styles.editFields}>
                <label className={styles.label} htmlFor={titleInputId}>Title</label>
                <input
                  id={titleInputId}
                  className={styles.input}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  autoFocus
                />
                <label className={styles.label} htmlFor={authorInputId}>Author</label>
                <input
                  id={authorInputId}
                  className={styles.input}
                  value={draft.author}
                  onChange={(e) => setDraft({ ...draft, author: e.target.value })}
                />
                <div className={styles.row}>
                  <div style={{ flex: 1 }}>
                    <label className={styles.label} htmlFor={isbnInputId}>ISBN</label>
                    <input
                      id={isbnInputId}
                      className={styles.input}
                      value={draft.isbn}
                      onChange={(e) => setDraft({ ...draft, isbn: e.target.value })}
                    />
                  </div>
                  <div style={{ width: '90px' }}>
                    <label className={styles.label} htmlFor={pagesInputId}>Pages</label>
                    <input
                      id={pagesInputId}
                      className={styles.input}
                      type="number"
                      value={draft.pageCount || ''}
                      onChange={(e) => setDraft({ ...draft, pageCount: parseInt(e.target.value) || 0 })}
                      min={0}
                    />
                  </div>
                </div>
                <div className={styles.row}>
                  <div style={{ flex: 1 }}>
                    <label className={styles.label} htmlFor={seriesInputId}>Series</label>
                    <input
                      id={seriesInputId}
                      className={styles.input}
                      value={draft.seriesName}
                      onChange={(e) => setDraft({ ...draft, seriesName: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                  <div style={{ width: '90px' }}>
                    <label className={styles.label} htmlFor={seriesIndexInputId}>Vol.#</label>
                    <input
                      id={seriesIndexInputId}
                      className={styles.input}
                      inputMode="decimal"
                      value={draft.seriesIndex}
                      onChange={(e) => setDraft({ ...draft, seriesIndex: e.target.value })}
                      placeholder="—"
                    />
                  </div>
                </div>
                <label className={styles.label} htmlFor={coverInputId}>Cover URL</label>
                <input
                  id={coverInputId}
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
            </div>
          ) : (
            <>
              <div className={styles.coverHero}>
                <img
                  src={getBookCoverSrc(book.coverImg)}
                  alt={book.title}
                  className={styles.coverHeroImg}
                />
              </div>
              <div className={styles.metaBelow}>
                <h2 className={styles.title}>{book.title}</h2>
                <p className={styles.author}>{book.author}</p>
                {(book.seriesName || book.seriesIndex != null) && (
                  <p className={styles.seriesLine}>
                    {book.seriesName}
                    {book.seriesName && book.seriesIndex != null ? ' · ' : ''}
                    {book.seriesIndex != null ? `Book ${book.seriesIndex}` : ''}
                  </p>
                )}
                <div className={styles.details}>
                  {!isBookPhotoOnly(book) && <span>ISBN: {book.isbn}</span>}
                  {book.pageCount > 0 && <span>{book.pageCount} pages</span>}
                  <span>Added {new Date(book.dateAdded).toLocaleDateString()}</span>
                  {book.startedAt && <span>Started {new Date(book.startedAt).toLocaleDateString()}</span>}
                  {book.finishedAt && <span>Finished {new Date(book.finishedAt).toLocaleDateString()}</span>}
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
                {!isBookPhotoOnly(book) && (
                  <div className={styles.sourceRow}>
                    {book.metadataSource && (
                      <span
                        className={styles.sourceBadge}
                        title={`Metadata from ${METADATA_SOURCE_LABEL[book.metadataSource]}`}
                        aria-label={`Metadata source: ${METADATA_SOURCE_LABEL[book.metadataSource]}`}
                      >
                        {METADATA_SOURCE_LABEL[book.metadataSource]}
                      </span>
                    )}
                    {book.needsReview && book.reviewReason && (
                      <span className={styles.reviewReason}>
                        {book.reviewReason}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleRefreshMetadata}
                      disabled={lookupLoading}
                      className={styles.refreshBtn}
                      aria-label="Refresh metadata from provider"
                    >
                      <RefreshCw size={12} /> {lookupLoading ? 'Refreshing…' : 'Refresh metadata'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          <div className={styles.stickyStatus}>
            <div className={styles.statusRow}>
              {(['to-read', 'reading', 'read', 'dnf'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => updateBookStatus(book.id, st)}
                  className={`${styles.statusBtn} ${book.status === st ? styles[`status_${st.replace('-', '_')}`] : ''}`}
                  aria-label={`Set status to ${statusLabels[st]}`}
                >
                  {statusIcons[st]}
                  <span className={styles.statusLabel}>{statusLabels[st]}</span>
                </button>
              ))}
            </div>
          </div>

        <div className={styles.progressSection}>
          <div className={styles.progressHeader}>
            <strong>Reading progress</strong>
            <span>{progressPercent}% complete</span>
          </div>
          <div className={styles.progressTrack}>
            <span className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
          </div>
          <div className={styles.progressMeta}>
            <span>{book.pageCount > 0 ? `${progressValue} / ${book.pageCount} complete` : `${progressValue} logged`}</span>
            {book.lastProgressAt && <span>Updated {new Date(book.lastProgressAt).toLocaleDateString()}</span>}
          </div>
          <div className={styles.progressActions}>
            <button type="button" className={styles.quickBtn} onClick={() => updateBookStatus(book.id, 'reading')}>
              Start reading
            </button>
            <button type="button" className={styles.quickBtn} onClick={() => updateReadingProgress(book.id, progressValue + 25)}>
              {book.pageCount > 0 ? '+25 pages' : 'Log progress'}
            </button>
            <button type="button" className={styles.quickBtn} onClick={() => updateBookStatus(book.id, 'read')}>
              Finish book
            </button>
            <button type="button" className={styles.quickBtn} onClick={() => updateBookStatus(book.id, 'dnf')}>
              Mark DNF
            </button>
            {book.needsReview && (
              <button type="button" className={styles.quickBtn} onClick={() => markNeedsReview(book.id, false)}>
                Resolve review
              </button>
            )}
          </div>
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
            <div ref={shelfAnchorRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowShelfPicker(!showShelfPicker)}
                className={styles.addShelfBtn}
                aria-label="Add to shelf"
                aria-expanded={showShelfPicker}
              >
                <Tag size={12} /> + Shelf
              </button>
              {showShelfPicker && availableShelves.length > 0 && (
                <div className={styles.shelfPicker} role="listbox" aria-label="Choose shelf">
                  {availableShelves.map((shelf) => (
                    <button
                      key={shelf.id}
                      type="button"
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
        <label className={styles.highlightsLabel} htmlFor={notesInputId}>
          Notes
        </label>
        <textarea
          id={notesInputId}
          placeholder="Add your notes or quotes..."
          value={book.notes}
          onChange={(e) => updateBookNotes(book.id, e.target.value)}
          className={styles.notes}
        />

        <label className={styles.highlightsLabel} htmlFor={`highlights-${book.id}`}>
          Highlights & quotes
        </label>
        <textarea
          id={`highlights-${book.id}`}
          placeholder="One quote or highlight per paragraph (blank line between entries)..."
          value={(book.highlights ?? []).join('\n\n')}
          onChange={(e) => {
            const parts = e.target.value.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
            updateBook(book.id, { highlights: parts });
          }}
          className={styles.highlights}
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
    </div>
  );
};

export default BookDetail;
