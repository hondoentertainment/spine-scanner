import React from 'react';
import { Cloud, CloudOff, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useSyncQueue } from '../store/useSyncQueue.ts';
import { useBookStore } from '../store/useBookStore.ts';
import { formatRelativeTime } from '../utils/formatRelativeTime.ts';
import styles from './SyncStatusBanner.module.css';

interface SyncStatusBannerProps {
  online: boolean;
  syncing: boolean;
  onSyncNow: () => void;
}

const SyncStatusBanner: React.FC<SyncStatusBannerProps> = ({ online, syncing, onSyncNow }) => {
  const { pendingChanges, lastSyncedAt, lastSyncFailedAt } = useSyncQueue();
  const storageNearLimit = useBookStore((s) => s.storageNearLimit);

  const syncFailedRecently =
    lastSyncFailedAt != null && Date.now() - lastSyncFailedAt < 5 * 60 * 1000; // 5 min

  // Storage quota warning takes highest priority
  if (storageNearLimit) {
    return (
      <div className={`${styles.banner} ${styles.warning}`} role="alert">
        <AlertTriangle size={14} />
        <span>Storage is nearly full. Export your library or remove old books to free space.</span>
      </div>
    );
  }

  // Not signed in — no sync banner needed
  if (pendingChanges === 0 && !lastSyncedAt && !syncFailedRecently && !syncing) {
    return null;
  }

  if (!online) {
    return (
      <div className={`${styles.banner} ${styles.offline}`} role="status">
        <CloudOff size={14} />
        <span>
          Offline — {pendingChanges > 0 ? `${pendingChanges} change${pendingChanges !== 1 ? 's' : ''} will sync when reconnected` : 'changes saved locally'}
        </span>
      </div>
    );
  }

  if (syncFailedRecently) {
    return (
      <div className={`${styles.banner} ${styles.error}`} role="alert">
        <AlertTriangle size={14} />
        <span>Sync failed</span>
        <button
          type="button"
          className={styles.action}
          onClick={onSyncNow}
          disabled={syncing}
          aria-label="Retry sync now"
        >
          {syncing ? <RefreshCw size={12} className={styles.spin} /> : 'Retry now'}
        </button>
      </div>
    );
  }

  if (syncing) {
    return (
      <div className={`${styles.banner} ${styles.syncing}`} role="status" aria-live="polite">
        <RefreshCw size={14} className={styles.spin} />
        <span>Syncing…</span>
      </div>
    );
  }

  if (pendingChanges > 0) {
    return (
      <div className={`${styles.banner} ${styles.pending}`} role="status">
        <Cloud size={14} />
        <span>{pendingChanges} unsaved change{pendingChanges !== 1 ? 's' : ''}</span>
        <button
          type="button"
          className={styles.action}
          onClick={onSyncNow}
          aria-label="Sync changes now"
        >
          Sync now
        </button>
      </div>
    );
  }

  if (lastSyncedAt) {
    return (
      <div className={`${styles.banner} ${styles.synced}`} role="status">
        <CheckCircle2 size={14} />
        <span>Synced {formatRelativeTime(lastSyncedAt)}</span>
      </div>
    );
  }

  return null;
};

export default SyncStatusBanner;
