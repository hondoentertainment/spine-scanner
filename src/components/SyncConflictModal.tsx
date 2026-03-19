import React, { useId } from 'react';
import { AlertTriangle, X, Monitor, Cloud, CheckCircle2 } from 'lucide-react';
import { useSyncQueue, type SyncConflict } from '../store/useSyncQueue.ts';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';
import type { BookEntry } from '../types.ts';
import s from './SyncConflictModal.module.css';

// ---- helpers ----------------------------------------------------------------

function truncate(text: string, maxLen: number): string {
  if (!text) return '';
  return text.length <= maxLen ? text : text.slice(0, maxLen) + '…';
}

function formatStatus(status: BookEntry['status']): string {
  switch (status) {
    case 'to-read':  return 'To Read';
    case 'reading':  return 'Reading';
    case 'read':     return 'Read';
    case 'dnf':      return 'Did Not Finish';
    default:         return status;
  }
}

function statusCssClass(status: BookEntry['status']): string {
  return status.replace('-', '_');
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

// ---- sub-components ---------------------------------------------------------

interface VersionColProps {
  label: string;
  labelClass: string;
  icon: React.ReactNode;
  book: BookEntry;
  actionLabel: string;
  actionClass: string;
  onKeep: () => void;
}

const VersionCol: React.FC<VersionColProps> = ({
  label, labelClass, icon, book, actionLabel, actionClass, onKeep,
}) => {
  const notes = truncate(book.notes ?? '', 80);
  // updatedAt is not part of BookEntry — fall back to dateAdded
  const updatedAt = formatDate((book as BookEntry & { updatedAt?: string }).updatedAt ?? book.dateAdded);

  return (
    <div className={s.versionCol}>
      <div className={`${s.versionLabel} ${labelClass}`}>
        {icon}
        {label}
      </div>

      <div className={s.fieldList}>
        <div className={s.field}>
          <span className={s.fieldName}>Title</span>
          <span className={s.fieldValue}>{book.title || '—'}</span>
        </div>
        <div className={s.field}>
          <span className={s.fieldName}>Author</span>
          <span className={s.fieldValue}>{book.author || '—'}</span>
        </div>
        <div className={s.field}>
          <span className={s.fieldName}>Status</span>
          <span className={`${s.statusBadge} ${s[`status_${statusCssClass(book.status)}`]}`}>
            {formatStatus(book.status)}
          </span>
        </div>
        <div className={s.field}>
          <span className={s.fieldName}>Progress</span>
          <span className={s.fieldValue}>
            {(book as BookEntry & { progressPages?: number }).progressPages != null
              ? `${(book as BookEntry & { progressPages?: number }).progressPages} pages`
              : '—'}
          </span>
        </div>
        <div className={s.field}>
          <span className={s.fieldName}>Notes</span>
          {notes
            ? <span className={s.fieldValue}>{notes}</span>
            : <span className={s.fieldValueMuted}>No notes</span>}
        </div>
        <div className={s.field}>
          <span className={s.fieldName}>Updated</span>
          <span className={s.fieldValue}>{updatedAt}</span>
        </div>
      </div>

      <div className={s.versionActions}>
        <button type="button" className={actionClass} onClick={onKeep}>
          {actionLabel}
        </button>
      </div>
    </div>
  );
};

// ---- single conflict card ---------------------------------------------------

interface ConflictCardProps {
  conflict: SyncConflict;
  onResolve: (keep: 'local' | 'remote') => void;
}

const ConflictCard: React.FC<ConflictCardProps> = ({ conflict, onResolve }) => (
  <div className={s.conflictCard}>
    <div className={s.conflictBookTitle}>
      Conflict for <strong>{conflict.local.title || conflict.bookId}</strong>
    </div>
    <div className={s.versions}>
      <VersionCol
        label="Your version"
        labelClass={s.localLabel}
        icon={<Monitor size={11} />}
        book={conflict.local}
        actionLabel="Keep Mine"
        actionClass={s.keepMineBtn}
        onKeep={() => onResolve('local')}
      />
      <VersionCol
        label="Cloud version"
        labelClass={s.remoteLabel}
        icon={<Cloud size={11} />}
        book={conflict.remote}
        actionLabel="Keep Cloud"
        actionClass={s.keepCloudBtn}
        onKeep={() => onResolve('remote')}
      />
    </div>
  </div>
);

// ---- main modal -------------------------------------------------------------

const SyncConflictModal: React.FC = () => {
  const { conflicts, resolveConflict, clearConflicts } = useSyncQueue();
  const trapRef = useFocusTrap<HTMLDivElement>();
  const titleId = useId();
  const [done, setDone] = React.useState(false);

  // Reset done state if new conflicts appear
  React.useEffect(() => {
    if (conflicts.length > 0) setDone(false);
  }, [conflicts.length]);

  if (conflicts.length === 0 && !done) return null;

  const handleResolve = (bookId: string, keep: 'local' | 'remote') => {
    resolveConflict(bookId, keep);
    // After resolving last conflict, show done state briefly then auto-close
    // (done state shows a "Done" button; conflicts array is now empty)
    if (conflicts.length === 1) {
      setDone(true);
    }
  };

  const handleClose = () => {
    clearConflicts();
    setDone(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') handleClose();
  };

  return (
    <div
      className={s.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={handleKeyDown}
      ref={trapRef}
    >
      <div className={s.modal}>
        {/* Close button */}
        <button
          type="button"
          className={s.closeBtn}
          onClick={handleClose}
          aria-label="Dismiss conflict resolution"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className={s.header}>
          <AlertTriangle size={20} className={s.headerIcon} />
          <div className={s.headerText}>
            <h2 id={titleId} className={s.title}>
              {done ? 'All conflicts resolved' : `Sync Conflict${conflicts.length > 1 ? 's' : ''} Detected`}
            </h2>
            <p className={s.subtitle}>
              {done
                ? 'Your library is up to date.'
                : `${conflicts.length} book${conflicts.length !== 1 ? 's were' : ' was'} edited on multiple devices. Choose which version to keep.`}
            </p>
          </div>
        </div>

        {/* Conflict cards */}
        {!done && conflicts.map((conflict) => (
          <ConflictCard
            key={conflict.bookId}
            conflict={conflict}
            onResolve={(keep) => handleResolve(conflict.bookId, keep)}
          />
        ))}

        {/* Done footer */}
        {done && (
          <div className={s.doneFooter}>
            <button type="button" className={s.doneBtn} onClick={handleClose}>
              <CheckCircle2 size={15} />
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SyncConflictModal;
