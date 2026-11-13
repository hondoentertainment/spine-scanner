import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../components/Toast.tsx';
import { getCloudLinkDecision, setCloudLinkDecision, shouldOfferLocalMerge } from '../lib/cloudLink.ts';
import { addBreadcrumb, captureException } from '../lib/errorMonitoring.ts';
import { mergeSync } from '../lib/syncBooks.ts';
import { useAuthStore } from '../store/useAuthStore.ts';
import { useBookStore } from '../store/useBookStore.ts';
import { useSyncQueue } from '../store/useSyncQueue.ts';
import { useOnlineStatus } from './useOnlineStatus.ts';

/** First-sign-in merge, dirty tracking, and the cloud flush queue. */
export function useLibrarySync() {
  const { user } = useAuthStore();
  const { books, setBooks, shelves, setShelves } = useBookStore();
  const { pendingChanges, markDirty, markSynced, markSyncFailed, flushing, setFlushing } = useSyncQueue();
  const lastSyncFailedAt = useSyncQueue((s) => s.lastSyncFailedAt);
  const lastSyncedAt = useSyncQueue((s) => s.lastSyncedAt);
  const syncFailedRecently = lastSyncFailedAt != null && Date.now() - lastSyncFailedAt < 90_000;
  const { online, justReconnected, clearReconnected } = useOnlineStatus();
  const { toast } = useToast();
  const [mergeOffer, setMergeOffer] = useState<{ count: number } | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const initialSyncDone = useRef(false);
  const prevBooksRef = useRef(books);
  const prevShelvesRef = useRef(shelves);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) {
      initialSyncDone.current = false;
      setMergeOffer(null);
      return;
    }
    let cancelled = false;
    const localBooks = useBookStore.getState().books;
    const localShelves = useBookStore.getState().shelves;
    const decision = getCloudLinkDecision(userId);
    const action = shouldOfferLocalMerge({
      localBookCount: localBooks.length,
      pendingCloudLink: useAuthStore.getState().pendingCloudLink,
      decision,
    });

    if (action === 'offer') {
      if (decision == null) setCloudLinkDecision(userId, 'offer');
      setMergeOffer({ count: localBooks.length });
      initialSyncDone.current = true;
      prevBooksRef.current = localBooks;
      prevShelvesRef.current = localShelves;
      return;
    }

    if (action === 'hold') {
      setMergeOffer(null);
      initialSyncDone.current = true;
      prevBooksRef.current = localBooks;
      prevShelvesRef.current = localShelves;
      return;
    }

    const doInitialSync = async () => {
      setFlushing(true);
      const merged = await mergeSync(userId, localBooks, localShelves);
      if (!cancelled && merged) {
        setBooks(merged.books);
        setShelves(merged.shelves);
        markSynced();
        setCloudLinkDecision(userId, 'merged');
        useAuthStore.setState({ pendingCloudLink: false });
      }
      if (!cancelled) {
        setFlushing(false);
        initialSyncDone.current = true;
        prevBooksRef.current = merged?.books ?? localBooks;
        prevShelvesRef.current = merged?.shelves ?? localShelves;
      }
    };

    void doInitialSync();
    return () => { cancelled = true; };
    // Books are read at sign-in so a later edit does not retrigger the first merge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!user || !initialSyncDone.current) return;
    if (books !== prevBooksRef.current || shelves !== prevShelvesRef.current) {
      const libraryChanged = books !== prevBooksRef.current;
      markDirty(libraryChanged ? 'Library edited on this device' : 'Shelves edited on this device');
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
        if (user?.id) {
          setCloudLinkDecision(user.id, 'merged');
          useAuthStore.setState({ pendingCloudLink: false });
          setMergeOffer(null);
        }
        addBreadcrumb('sync', 'Queue flush succeeded', {
          books: merged.books.length,
          shelves: merged.shelves.length,
        });
        return true;
      }
    } catch (err) {
      console.error('[sync] Flush failed:', err);
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

  useEffect(() => {
    if (!justReconnected) return;
    const wasReconnect = true;
    clearReconnected();
    const linkDecision = user?.id ? getCloudLinkDecision(user.id) : null;
    if (user && pendingChanges > 0 && !flushing && linkDecision !== 'later' && linkDecision !== 'offer') {
      void flushQueue().then((ok) => {
        if (ok && wasReconnect) toast('Back online – changes synced', 'success');
      });
    }
  }, [justReconnected, user, pendingChanges, flushing, clearReconnected, flushQueue, toast]);

  const acceptCloudMerge = useCallback(async () => {
    if (!user?.id) return;
    setMergeError(null);
    setFlushing(true);
    try {
      const merged = await mergeSync(user.id, useBookStore.getState().books, useBookStore.getState().shelves);
      if (!merged) {
        setMergeError('Could not reach your account. Your books are still only on this device.');
        return;
      }
      setBooks(merged.books);
      setShelves(merged.shelves);
      markSynced();
      prevBooksRef.current = merged.books;
      prevShelvesRef.current = merged.shelves;
      setCloudLinkDecision(user.id, 'merged');
      useAuthStore.setState({ pendingCloudLink: false });
      setMergeOffer(null);
      toast('Merged this device into your account. Nothing was deleted.', 'success');
    } finally {
      setFlushing(false);
    }
  }, [user, setBooks, setShelves, markSynced, setFlushing, toast]);

  const declineCloudMerge = useCallback(() => {
    if (user?.id) setCloudLinkDecision(user.id, 'later');
    useAuthStore.setState({ pendingCloudLink: false });
    setMergeOffer(null);
    setMergeError(null);
    toast('Your books stay on this device. Use Sync when you want them in your account.', 'info');
  }, [user, toast]);

  const handleSyncNow = useCallback(async () => {
    if (!user) return;
    await flushQueue();
  }, [user, flushQueue]);

  return {
    online,
    pendingChanges,
    lastSyncedAt,
    lastSyncFailedAt,
    syncFailedRecently,
    flushing,
    mergeOffer,
    mergeError,
    acceptCloudMerge,
    declineCloudMerge,
    handleSyncNow,
  };
}
