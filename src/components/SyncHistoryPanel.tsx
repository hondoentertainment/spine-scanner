import { useState } from 'react';
import { useSyncHistoryStore, type SyncHistoryEntry } from '../store/useSyncHistoryStore';
import styles from './SyncHistoryPanel.module.css';

function statusIcon(status: SyncHistoryEntry['status']) {
  if (status === 'success') return '\u2713';
  if (status === 'failed') return '\u2717';
  return '\u25CB'; // partial
}

function statusClass(status: SyncHistoryEntry['status']) {
  if (status === 'success') return styles.statusSuccess;
  if (status === 'failed') return styles.statusFailed;
  return styles.statusPartial;
}

function directionLabel(dir: SyncHistoryEntry['direction']) {
  if (dir === 'push') return 'Push';
  if (dir === 'pull') return 'Pull';
  return 'Merge';
}

function formatTimestamp(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

interface Props {
  onClose: () => void;
  onRestoreSnapshot?: (books: string, shelves: string) => void;
}

export default function SyncHistoryPanel({ onClose, onRestoreSnapshot }: Props) {
  const { history, clearHistory, getSnapshot } = useSyncHistoryStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);

  const snapshot = getSnapshot();

  const handleClear = () => {
    clearHistory();
    setConfirmClear(false);
  };

  const handleRestore = () => {
    if (snapshot && onRestoreSnapshot) {
      onRestoreSnapshot(snapshot.books, snapshot.shelves);
    }
    setConfirmRestore(false);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Sync History</h2>
        <button className={styles.closeBtn} onClick={onClose}>
          Close
        </button>
      </div>

      {history.length === 0 ? (
        <p className={styles.emptyMsg}>No sync history yet.</p>
      ) : (
        <ul className={styles.list}>
          {history.map((entry) => {
            const isExpanded = expandedId === entry.id;
            return (
              <li key={entry.id} className={styles.entry}>
                <button
                  className={styles.entryHeader}
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                >
                  <span className={`${styles.statusIcon} ${statusClass(entry.status)}`}>
                    {statusIcon(entry.status)}
                  </span>
                  <span className={styles.direction}>{directionLabel(entry.direction)}</span>
                  <span className={styles.timestamp}>{formatTimestamp(entry.timestamp)}</span>
                  <span className={styles.changes}>
                    {entry.booksChanged}B / {entry.shelvesChanged}S
                  </span>
                  <span className={styles.duration}>{entry.duration}ms</span>
                  <span className={styles.chevron}>{isExpanded ? '\u25B2' : '\u25BC'}</span>
                </button>

                {isExpanded && (
                  <div className={styles.details}>
                    <div className={styles.detailRow}>
                      <span>Status:</span>
                      <span className={statusClass(entry.status)}>{entry.status}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span>Direction:</span>
                      <span>{directionLabel(entry.direction)}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span>Books changed:</span>
                      <span>{entry.booksChanged}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span>Shelves changed:</span>
                      <span>{entry.shelvesChanged}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span>Conflicts resolved:</span>
                      <span>{entry.conflictsResolved}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span>Duration:</span>
                      <span>{entry.duration}ms</span>
                    </div>
                    {entry.errorMessage && (
                      <div className={styles.errorRow}>
                        <span>Error:</span>
                        <span>{entry.errorMessage}</span>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className={styles.actions}>
        {!confirmClear ? (
          <button
            className={styles.clearBtn}
            onClick={() => setConfirmClear(true)}
            disabled={history.length === 0}
          >
            Clear History
          </button>
        ) : (
          <div className={styles.confirmBox}>
            <span className={styles.confirmMsg}>Clear all sync history?</span>
            <button className={styles.confirmYes} onClick={handleClear}>
              Yes, clear
            </button>
            <button className={styles.confirmNo} onClick={() => setConfirmClear(false)}>
              Cancel
            </button>
          </div>
        )}

        {snapshot && onRestoreSnapshot && (
          <>
            {!confirmRestore ? (
              <button
                className={styles.restoreBtn}
                onClick={() => setConfirmRestore(true)}
              >
                Restore Snapshot ({formatTimestamp(snapshot.timestamp)})
              </button>
            ) : (
              <div className={styles.confirmBox}>
                <span className={styles.confirmMsg}>
                  Restore library from snapshot taken {formatTimestamp(snapshot.timestamp)}?
                </span>
                <button className={styles.confirmYes} onClick={handleRestore}>
                  Yes, restore
                </button>
                <button className={styles.confirmNo} onClick={() => setConfirmRestore(false)}>
                  Cancel
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
