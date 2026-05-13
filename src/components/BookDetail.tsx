import React, { useState, useEffect, useRef } from 'react';
import { useBookStore } from '../store/useBookStore.ts';
import { useReadingSessionStore } from '../store/useReadingSessionStore.ts';
import { useToast } from './Toast.tsx';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';
import { useBookLookup } from '../hooks/useBookLookup.ts';
import type { BookEntry } from '../types.ts';
import { generateAmazonLink } from '../utils/amazonLink.ts';
import { getBookCoverSrc } from '../utils/bookPresentation.ts';
import { shareBook } from '../utils/shareBook.ts';
import { isBookPhotoOnly } from '../utils/libraryUtils.ts';
import { getReadingProgressPercent } from '../utils/bookState.ts';
import {
  X, ExternalLink, BookOpen, CheckCircle, Clock, XCircle,
  Pencil, Save, Tag, Trash2, Share2, RefreshCw, AlertTriangle
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
  const { sessions: allSessions, addSession, removeSession, sessionsForBook, stats } = useReadingSessionStore();
  const { toast, confirm } = useToast();
  const { refreshMetadata, loading: refreshLoading } = useBookLookup();
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

  const bookSessions = sessionsForBook(book.id);
  const bookStats = stats(book.id);
  const showSessionSection =
    (book.status === 'reading' || book.status === 'read') && bookSessions.length > 0;

  const todayKey = (() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  })();

  const [showLogForm, setShowLogForm] = useState(false);
  const [logDate, setLogDate] = useState(todayKey);
  const [logDuration, setLogDuration] = useState(30);
  const [logPages, setLogPages] = useState(0);

  const handleAddSession = () => {
    addSession({
      id: crypto.randomUUID(),
      bookId: book.id,
      durationMin: Math.max(1, logDuration),
      pagesRead: Math.max(0, logPages),
      date: logDate,
    });
    setShowLogForm(false);
    setLogDate(todayKey);
    setLogDuration(30);
    setLogPages(0);
    toast('Session logged', 'success');
  };

  // suppress unused warning from allSessions subscription (ensures reactivity)
  void allSessions;

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

    // Track which fields the user changed so they are preserved on metadata refresh
    const changedFields: string[] = [];
    if (draft.title.trim() !== book.title) changedFields.push('title');
    if (draft.author.trim() !== book.author) changedFields.push('author');
    if (draft.isbn.trim() !== book.isbn) changedFields.push('isbn');
    if ((draft.pageCount || 0) !== book.pageCount) changedFields.push('pageCount');
    if (draft.coverImg.trim() !== book.coverImg) changedFields.push('coverImg');
    const userEditedFields = [...new Set([...(book.userEditedFields ?? []), ...changedFields])];

    updateBook(book.id, {
      title: draft.title.trim() || book.title,
      author: draft.author.trim() || book.author,
      isbn: draft.isbn.trim() || book.isbn,
      pageCount: draft.pageCount || 0,
      coverImg: draft.coverImg.trim(),
      amazonLink: generateAmazonLink(draft.isbn.trim() || book.isbn),
      seriesName: draft.seriesName.trim() || undefined,
      seriesIndex: parsedIdx !== undefined && Number.isFinite(parsedIdx) ? parsedIdx : undefined,
      userEditedFields,
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

  const handleRefreshMetadata = async () => {
    const newMeta = await refreshMetadata(book);
    if (!newMeta) {
      toast('Could not find updated metadata for this ISBN', 'error');
      return;
    }

    const editedFields = book.userEditedFields ?? [];
    const REFRESHABLE = ['title', 'author', 'pageCount', 'coverImg'] as const;

    const willUpdate = REFRESHABLE.filter((f) => {
      if (editedFields.includes(f)) return false;
      const newVal = f === 'title' ? newMeta.title
        : f === 'author' ? (newMeta.author ?? '')
        : f === 'pageCount' ? newMeta.pageCount
        : newMeta.coverImg;
      const curVal = f === 'author' ? book.author : book[f];
      return newVal !== curVal;
    });
    const willKeep = REFRESHABLE.filter((f) => editedFields.includes(f));

    if (willUpdate.length === 0) {
      toast('Metadata is already up to date', 'info');
      return;
    }

    const updateSummary = willUpdate.join(', ');
    const keepSummary = willKeep.length > 0 ? ` Your edits to ${willKeep.join(', ')} will be kept.` : '';
    const yes = await confirm({
      title: 'Refresh Metadata',
      message: `Will update: ${updateSummary}.${keepSummary}`,
      confirmLabel: 'Refresh',
    });
    if (!yes) return;

    const updates: Partial<Omit<BookEntry, 'id'>> = {
      metadataSource: newMeta.metadataSource,
      metadataConflicts: newMeta.metadataConflicts,
    };
    if (willUpdate.includes('title')) updates.title = newMeta.title;
    if (willUpdate.includes('author')) updates.author = newMeta.author ?? book.author;
    if (willUpdate.includes('pageCount')) updates.pageCount = newMeta.pageCount;
    if (willUpdate.includes('coverImg')) updates.coverImg = newMeta.coverImg;

    updateBook(book.id, updates);
    toast('Metadata refreshed', 'success');
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
                {book.status === 'reading' && (
                  <div className={styles.pagesReadRow}>
                    <label className={styles.label} htmlFor={`pages-read-${book.id}`}>Pages read</label>
                    <input
                      id={`pages-read-${book.id}`}
                      className={styles.input}
                      type="number"
                      min={0}
                      max={book.pageCount || undefined}
                      value={progressValue || ''}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!Number.isNaN(val)) updateReadingProgress(book.id, val);
                      }}
                    />
                  </div>
                )}
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
                  {book.metadataSource && (
                    <span className={styles.sourceBadge}>
                      via {sourceLabels[book.metadataSource] ?? book.metadataSource}
                    </span>
                  )}
                </div>
                {book.metadataConflicts && book.metadataConflicts.length > 0 && (
                  <div className={styles.conflictWarning} role="status" aria-label="Metadata conflict">
                    <AlertTriangle size={13} />
                    <span>Sources disagree on {book.metadataConflicts.map(c => c.field).join(', ')}</span>
                  </div>
                )}
                {book.status === 'reading' && book.pageCount > 0 && (
                  <p className={styles.progressLine}>
                    {progressValue} of {book.pageCount} pages ({progressPercent}%)
                  </p>
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

        {/* Reading sessions */}
        {showSessionSection && (
          <div className={styles.sessionsSection}>
            <div className={styles.sectionHeader}>
              <strong className={styles.sectionTitle}>Reading sessions</strong>
            </div>
            <div className={styles.statsRow}>
              <span>{bookStats.totalSessions} sessions</span>
              <span>{bookStats.avgPagesPerHour} pg/hr avg</span>
              <span>Longest: {bookStats.longestSessionMin}m</span>
              <span>This week: {bookStats.sessionsThisWeek}</span>
            </div>
            <div className={styles.sessionList}>
              {[...bookSessions].reverse().map((session) => (
                <div key={session.id} className={styles.sessionItem}>
                  <span className={styles.sessionDate}>{session.date}</span>
                  <span className={styles.sessionDuration}>{session.durationMin}m</span>
                  <span className={styles.sessionPages}>{session.pagesRead > 0 ? `${session.pagesRead} pg` : '—'}</span>
                  <button
                    type="button"
                    className={styles.sessionRemoveBtn}
                    aria-label="Remove session"
                    onClick={() => removeSession(session.id)}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
            {showLogForm ? (
              <div className={styles.logForm}>
                <input
                  type="date"
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                  className={styles.input}
                />
                <div className={styles.row}>
                  <div style={{ flex: 1 }}>
                    <label className={styles.label}>Duration (min)</label>
                    <input
                      type="number"
                      min={1}
                      value={logDuration}
                      onChange={(e) => setLogDuration(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className={styles.input}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className={styles.label}>Pages read</label>
                    <input
                      type="number"
                      min={0}
                      value={logPages}
                      onChange={(e) => setLogPages(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className={styles.input}
                    />
                  </div>
                </div>
                <div className={styles.editActions}>
                  <button type="button" onClick={handleAddSession} className={styles.saveBtn}>
                    <Save size={14} /> Save
                  </button>
                  <button type="button" onClick={() => setShowLogForm(false)} className={styles.cancelBtn}>
                    <X size={14} /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className={styles.logSessionBtn} onClick={() => setShowLogForm(true)}>
                + Log session
              </button>
            )}
          </div>
        )}

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
          {!editing && !isBookPhotoOnly(book) && (
            <button
              onClick={handleRefreshMetadata}
              className={styles.refreshBtn}
              disabled={refreshLoading}
              aria-label="Refresh metadata from APIs"
            >
              <RefreshCw size={14} /> Refresh
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
