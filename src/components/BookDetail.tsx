import React, { useState, useEffect, useRef } from 'react';
import { useBookStore } from '../store/useBookStore.ts';
import { useBookLookup } from '../hooks/useBookLookup.ts';
import { useToast } from './Toast.tsx';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';
import type { BookEntry } from '../types.ts';
import { mergeMetadataUserEditedAfterSave } from '../lib/mergeMetadataUserEditedAfterSave.ts';
import { applyMetadataRefresh } from '../lib/metadataRefresh.ts';
import {
  applyMetadataPeerChoice,
  getMetadataConflictFlags,
  labelForMetadataSource,
} from '../lib/metadataPeers.ts';
import { generateAmazonLink } from '../utils/amazonLink.ts';
import { getBookCoverSrc } from '../utils/bookPresentation.ts';
import { shareBook, shareOrDownloadBookShareCard } from '../utils/shareBook.ts';
import { isBookPhotoOnly } from '../utils/libraryUtils.ts';
import { getReadingProgressPercent } from '../utils/bookState.ts';
import {
  X, ExternalLink, BookOpen, CheckCircle, Clock, XCircle,
  Pencil, Save, Tag, Trash2, Share2, RefreshCw, Image as ImageIcon, ImageDown,
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
  const { lookupByIsbn } = useBookLookup();
  const focusTrapRef = useFocusTrap<HTMLDivElement>();
  const shelfAnchorRef = useRef<HTMLDivElement>(null);
  const editBaselineRef = useRef({ title: '', author: '', pageCount: 0, coverImg: '' });
  const [refreshingMeta, setRefreshingMeta] = useState(false);
  const [fetchingCover, setFetchingCover] = useState(false);
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

  const handleEdit = () => {
    editBaselineRef.current = {
      title: book.title,
      author: book.author,
      pageCount: book.pageCount,
      coverImg: book.coverImg,
    };
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
    const base = editBaselineRef.current;
    const nextUserEdited = mergeMetadataUserEditedAfterSave(book.metadataUserEdited, base, {
      title: draft.title,
      author: draft.author,
      pageCount: draft.pageCount || 0,
      coverImg: draft.coverImg,
    });

    updateBook(book.id, {
      title: draft.title.trim() || book.title,
      author: draft.author.trim() || book.author,
      isbn: draft.isbn.trim() || book.isbn,
      pageCount: draft.pageCount || 0,
      coverImg: draft.coverImg.trim(),
      amazonLink: generateAmazonLink(draft.isbn.trim() || book.isbn),
      seriesName: draft.seriesName.trim() || undefined,
      seriesIndex: parsedIdx !== undefined && Number.isFinite(parsedIdx) ? parsedIdx : undefined,
      metadataUserEdited: nextUserEdited,
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

  useEffect(() => {
    if (!showShelfPicker) return;
    const onPointerDown = (ev: MouseEvent) => {
      if (shelfAnchorRef.current?.contains(ev.target as Node)) return;
      setShowShelfPicker(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [showShelfPicker]);

  const conflictFlags = getMetadataConflictFlags(book);
  const conflictAny = conflictFlags.author || conflictFlags.pageCount || conflictFlags.title;
  const hasBothPeers = Boolean(book.metadataPeers?.google && book.metadataPeers?.openLibrary);
  const missingCover = !isBookPhotoOnly(book) && !book.coverImg?.trim();
  const conflictSummary = (() => {
    if (!conflictAny) return '';
    const parts: string[] = [];
    if (conflictFlags.title) parts.push('title');
    if (conflictFlags.author) parts.push('author');
    if (conflictFlags.pageCount) parts.push('page count');
    if (parts.length === 1) return `Google Books and Open Library disagree on ${parts[0]}.`;
    if (parts.length === 2) return `Google Books and Open Library disagree on ${parts[0]} and ${parts[1]}.`;
    return `Google Books and Open Library disagree on ${parts[0]}, ${parts[1]}, and ${parts[2]}.`;
  })();

  const handleRefreshMetadata = async () => {
    if (isBookPhotoOnly(book)) {
      toast('Photo-only entries need an ISBN before metadata refresh.', 'error');
      return;
    }
    setRefreshingMeta(true);
    try {
      const lookup = await lookupByIsbn(book.isbn, { bypassCache: true });
      if (!lookup) {
        toast('No metadata found for this ISBN.', 'error');
        return;
      }
      const updates = applyMetadataRefresh(book, lookup);
      updateBook(book.id, updates);
      toast('Metadata refreshed from APIs', 'success');
    } finally {
      setRefreshingMeta(false);
    }
  };

  const handleFetchCover = async () => {
    if (isBookPhotoOnly(book)) return;
    if (book.metadataUserEdited?.coverImg) {
      toast('Cover is marked user-edited. Use Edit Details or Refresh metadata.', 'info');
      return;
    }
    setFetchingCover(true);
    try {
      const lookup = await lookupByIsbn(book.isbn, { bypassCache: true });
      const thumb = lookup?.thumbnail?.trim();
      if (!thumb) {
        toast('No cover image URL found for this ISBN.', 'error');
        return;
      }
      updateBook(book.id, { coverImg: thumb, amazonLink: generateAmazonLink(book.isbn) });
      toast('Cover image updated', 'success');
    } finally {
      setFetchingCover(false);
    }
  };

  const handleApplyPeer = (provider: 'google_books' | 'open_library') => {
    const updates = applyMetadataPeerChoice(book, provider);
    if (!updates) {
      toast('No saved snapshot for that provider.', 'error');
      return;
    }
    updateBook(book.id, updates);
    toast(`Applied ${provider === 'google_books' ? 'Google Books' : 'Open Library'} metadata`, 'success');
  };

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
                <div className={styles.row}>
                  <div style={{ flex: 1 }}>
                    <label className={styles.label}>Series</label>
                    <input
                      className={styles.input}
                      value={draft.seriesName}
                      onChange={(e) => setDraft({ ...draft, seriesName: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                  <div style={{ width: '90px' }}>
                    <label className={styles.label}>Vol.#</label>
                    <input
                      className={styles.input}
                      inputMode="decimal"
                      value={draft.seriesIndex}
                      onChange={(e) => setDraft({ ...draft, seriesIndex: e.target.value })}
                      placeholder="—"
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
                <div className={styles.metadataStrip} role="status" aria-live="polite">
                  <span className={styles.sourceBadge}>
                    Metadata: {labelForMetadataSource(book.metadataSource)}
                  </span>
                  {conflictAny && (
                    <span className={styles.conflictBanner}>{conflictSummary}</span>
                  )}
                </div>
                {hasBothPeers && conflictAny && (
                  <div className={styles.peerPickRow}>
                    <button
                      type="button"
                      className={styles.peerPickBtn}
                      onClick={() => handleApplyPeer('google_books')}
                    >
                      Use Google Books
                    </button>
                    <button
                      type="button"
                      className={styles.peerPickBtn}
                      onClick={() => handleApplyPeer('open_library')}
                    >
                      Use Open Library
                    </button>
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
                  <button
                    type="button"
                    onClick={() => void shareOrDownloadBookShareCard(book, toast)}
                    className={styles.shareBtn}
                    aria-label={`Download or share a card image for ${book.title}`}
                  >
                    <ImageDown size={12} /> Share card
                  </button>
                  {!isBookPhotoOnly(book) && (
                    <button
                      type="button"
                      onClick={() => void handleRefreshMetadata()}
                      className={styles.shareBtn}
                      disabled={refreshingMeta}
                      aria-busy={refreshingMeta}
                      aria-label="Refresh metadata from Google Books and Open Library"
                    >
                      <RefreshCw size={12} className={refreshingMeta ? styles.spinIcon : undefined} />
                      {refreshingMeta ? 'Refreshing…' : 'Refresh metadata'}
                    </button>
                  )}
                  {missingCover && (
                    <button
                      type="button"
                      onClick={() => void handleFetchCover()}
                      className={styles.shareBtn}
                      disabled={fetchingCover}
                      aria-busy={fetchingCover}
                      aria-label="Fetch cover image from metadata APIs"
                    >
                      <ImageIcon size={12} className={fetchingCover ? styles.spinIcon : undefined} />
                      {fetchingCover ? 'Fetching…' : 'Fetch cover'}
                    </button>
                  )}
                </div>
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
        <textarea
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
