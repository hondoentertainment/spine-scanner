import { useState, useEffect, useCallback } from 'react';

/**
 * React hook that tracks the browser's online/offline status.
 * Returns { online, wasOffline } where wasOffline is true for one render
 * cycle after transitioning from offline -> online (useful for triggering sync).
 */
export function useOnlineStatus() {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [justReconnected, setJustReconnected] = useState(false);

  const handleOnline = useCallback(() => {
    setOnline(true);
    setJustReconnected(true);
  }, []);

  const handleOffline = useCallback(() => {
    setOnline(false);
    setJustReconnected(false);
  }, []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  // Clear the justReconnected flag after consumers have had a chance to act on it
  const clearReconnected = useCallback(() => {
    setJustReconnected(false);
  }, []);

  return { online, justReconnected, clearReconnected };
}
