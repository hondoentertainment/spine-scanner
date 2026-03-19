import React from 'react';
import { Cloud, CloudOff, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useSyncQueue } from '../store/useSyncQueue.ts';
import { useBookStore } from '../store/useBookStore.ts';
import { formatRelativeTime } from '../utils/formatRelativeTime.ts';
import styles from './SyncStatusBanner.module.css';
import SyncConflictModal from './SyncConflictModal.tsx';

interface SyncStatusBannerProps {
  online: boolean;
  syncing: boolean;
  onSyncNow: () => void;
}

const SyncStatusBanner: React.FC<SyncStatusBannerProps> = ({ online, syncing, onSyncNow }) => {
  const { pendingChanges, lastSyncedAt, lastSyncFailedAt, conflicts } = useSyncQueue();
  const storageNearLimit = useBookStore((s) => s.storageNearLimit);

  const syncFailedRecently =
    lastSyncFailedAt != null && Date.now() - lastSyncFailedAt < 5 * 60 * 1000;

  const hasConflicts = conflicts.length > 0;

  let banner: React.ReactNode = null;

  if (storageNearLimit) {
    banner = (
      <div className={`${styles.banner} ${styles.warning}`} role="alert">
        <AlertTriangle size={14} />
        <span>Storage is nearly full. Export your library or remove old books to free space.</span>
      </div>
    );
  } else if (!online) {
    banner = (
      <div className={`${styles.banner} ${styles.offline}`} role="status">
        <CloudOff size={14} />
        <span>
          Offline — {pendingChanges > 0 ? `${pendingChanges} change${pendingChanges !== 1 ? 's' : ''} will sync when reconnected` : 'changes saved locally'}
        </span>
      </div>
    );
  } else if (syncFailedRecently) {
    banner = (
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
  } else if (syncing) {
    banner = (
      <div className={`${styles.banner} ${styles.syncing}`} role="status" aria-live="polite">
        <RefreshCw size={14} className={styles.spin} />
        <span>Syncing…</span>
      </div>
    );
  } else if (pendingChanges > 0) {
    banner = (
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
  } else if (lastSyncedAt) {
    banner = (
      <div className={`${styles.banner} ${styles.synced}`} role="status">
        <CheckCircle2 size={14} />
        <span>Synced {formatRelativeTime(lastSyncedAt)}</span>
      </div>
    );
  }

  if (!banner && !hasConflicts) return null;

  return (
    <>
      {banner}
      {hasConflicts && <SyncConflictModal />}
    </>
  );
};

export default SyncStatusBanner;
