import { useState } from 'react';
import { useSyncQueue } from '../store/useSyncQueue';
import styles from './OfflineQueueInspector.module.css';

interface Props {
  onSyncNow: () => void;
  onDiscardPending: () => void;
}

function formatTime(iso: string | null) {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatFailedTime(ts: number | null) {
  if (!ts) return 'None';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

export default function OfflineQueueInspector({ onSyncNow, onDiscardPending }: Props) {
  const {
    pendingChanges,
    lastSyncedAt,
    lastSyncFailedAt,
    flushing,
    syncFailedRecently,
  } = useSyncQueue();

  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const handleDiscard = () => {
    onDiscardPending();
    setConfirmDiscard(false);
  };

  const badgeStatus: 'synced' | 'pending' | 'failed' =
    syncFailedRecently()
      ? 'failed'
      : pendingChanges > 0
        ? 'pending'
        : 'synced';

  const badgeLabel =
    badgeStatus === 'synced'
      ? 'Synced'
      : badgeStatus === 'pending'
        ? 'Pending'
        : 'Failed';

  const badgeClass =
    badgeStatus === 'synced'
      ? styles.badgeSynced
      : badgeStatus === 'pending'
        ? styles.badgePending
        : styles.badgeFailed;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Offline Queue</h3>
        <span className={`${styles.badge} ${badgeClass}`}>{badgeLabel}</span>
      </div>

      <div className={styles.stats}>
        <div className={styles.statRow}>
          <span className={styles.statLabel}>Pending changes</span>
          <span className={styles.statValue}>{pendingChanges}</span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statLabel}>Last synced</span>
          <span className={styles.statValue}>{formatTime(lastSyncedAt)}</span>
        </div>
        {lastSyncFailedAt && (
          <div className={styles.statRow}>
            <span className={styles.statLabel}>Last failure</span>
            <span className={`${styles.statValue} ${styles.failedValue}`}>
              {formatFailedTime(lastSyncFailedAt)}
            </span>
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <button
          className={styles.syncNowBtn}
          onClick={onSyncNow}
          disabled={flushing}
        >
          {flushing ? 'Syncing...' : 'Sync Now'}
        </button>

        {!confirmDiscard ? (
          <button
            className={styles.discardBtn}
            onClick={() => setConfirmDiscard(true)}
            disabled={pendingChanges === 0}
          >
            Discard Pending
          </button>
        ) : (
          <div className={styles.confirmBox}>
            <span className={styles.confirmMsg}>
              Discard {pendingChanges} pending change{pendingChanges !== 1 ? 's' : ''}?
            </span>
            <button className={styles.confirmYes} onClick={handleDiscard}>
              Yes, discard
            </button>
            <button className={styles.confirmNo} onClick={() => setConfirmDiscard(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
