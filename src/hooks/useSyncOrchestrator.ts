import { useCallback, useEffect, useRef } from 'react';
import { useBookStore } from '../store/useBookStore.ts';
import { useAuthStore } from '../store/useAuthStore.ts';
import { useSyncQueue } from '../store/useSyncQueue.ts';
import { useOnlineStatus } from './useOnlineStatus.ts';
import { useToast } from '../components/Toast.tsx';
import { mergeSync } from '../lib/syncBooks.ts';
import { addBreadcrumb, captureException } from '../lib/errorMonitoring.ts';
import { logger } from '../lib/logger.ts';

export function useSyncOrchestrator() {
  const { books, shelves, setBooks, setShelves } = useBookStore();
  const { user } = useAuthStore();
  const { pendingChanges, markDirty, markSynced, markSyncFailed, flushing, setFlushing } = useSyncQueue();
  const lastSyncFailedAt = useSyncQueue((s) => s.lastSyncFailedAt);
  const lastSyncedAt = useSyncQueue((s) => s.lastSyncedAt);
  const syncFailedRecently = lastSyncFailedAt != null && Date.now() - lastSyncFailedAt < 90_000;
  const { online, justReconnected, clearReconnected } = useOnlineStatus();
  const { toast } = useToast();

  const initialSyncDone = useRef(false);
  const prevBooksRef = useRef(books);
  const prevShelvesRef = useRef(shelves);

  // Initial sync when user signs in
  useEffect(() => {
    if (!user) {
      initialSyncDone.current = false;
      return;
    }
    let cancelled = false;

    const doInitialSync = async () => {
      setFlushing(true);
      const merged = await mergeSync(user.id, books, shelves);
      if (!cancelled && merged) {
        setBooks(merged.books);
        setShelves(merged.shelves);
        markSynced();
      }
      if (!cancelled) {
        setFlushing(false);
        initialSyncDone.current = true;
        prevBooksRef.current = merged?.books ?? books;
        prevShelvesRef.current = merged?.shelves ?? shelves;
      }
    };

    void doInitialSync();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Mark dirty when books/shelves change after initial sync
  useEffect(() => {
    if (!user || !initialSyncDone.current) return;
    if (books !== prevBooksRef.current || shelves !== prevShelvesRef.current) {
      markDirty();
    }
    prevBooksRef.current = books;
    prevShelvesRef.current = shelves;
  }, [books, shelves, user, markDirty]);

  const flushQueue = useCallback(async (): Promise<boolean> => {
    if (!user || flushing) return false;
    setFlushing(true);
    try {
      addBreadcrumb('sync', 'Attempting queue flush', {
        pendingChanges,
        hasUser: Boolean(user),
      });
      const merged = await mergeSync(user.id, books, shelves);
      if (merged) {
        setBooks(merged.books);
        setShelves(merged.shelves);
        markSynced();
        prevBooksRef.current = merged.books;
        prevShelvesRef.current = merged.shelves;
        addBreadcrumb('sync', 'Queue flush succeeded', {
          books: merged.books.length,
          shelves: merged.shelves.length,
        });
        return true;
      }
    } catch (err) {
      logger.error('Flush failed', { error: String(err) });
      captureException(err, {
        area: 'flushQueue',
        pendingChanges,
        localBookCount: books.length,
        localShelfCount: shelves.length,
      });
      markSyncFailed();
      toast('Sync failed. Will retry when online.', 'error');
    } finally {
      setFlushing(false);
    }
    return false;
  }, [user, flushing, books, shelves, setBooks, setShelves, markSynced, markSyncFailed, setFlushing, toast, pendingChanges]);

  // Auto-flush on reconnect
  useEffect(() => {
    if (!justReconnected) return;
    const wasReconnect = true;
    clearReconnected();
    if (user && pendingChanges > 0 && !flushing) {
      void flushQueue().then((ok) => {
        if (ok && wasReconnect) toast('Back online – changes synced', 'success');
      });
    }
  }, [justReconnected, user, pendingChanges, flushing, clearReconnected, flushQueue, toast]);

  const handleSyncNow = useCallback(async () => {
    if (!user) return;
    await flushQueue();
  }, [user, flushQueue]);

  return {
    online,
    flushing,
    pendingChanges,
    lastSyncedAt,
    lastSyncFailedAt,
    syncFailedRecently,
    handleSyncNow,
  };
}
