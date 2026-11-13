import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isMvpMode } from '../lib/appMode.ts';
import { setTag, setUser as setMonitoringUser } from '../lib/errorMonitoring.ts';
import { useAuthStore } from '../store/useAuthStore.ts';
import { useProfileStore } from '../store/useProfileStore.ts';

/** Auth bootstrap, return-path restore, monitoring identity, and profile cloud sync. */
export function useAuthSession() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, authReturnPath, initialize: initAuth } = useAuthStore();
  const { preferences, loadFromCloud, saveToCloud, updatePreferences } = useProfileStore();

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  useEffect(() => {
    if (!authReturnPath) return;
    const current = `${location.pathname}${location.search}${location.hash}`;
    if (current !== authReturnPath) {
      navigate(authReturnPath, { replace: true });
    }
    useAuthStore.setState({ authReturnPath: null });
  }, [authReturnPath, location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    setMonitoringUser(user?.id ?? null);
    setTag('has_cloud_account', Boolean(user?.id));
  }, [user?.id]);

  useEffect(() => {
    setTag('app_mode', isMvpMode() ? 'mvp' : 'full');
  }, []);

  useEffect(() => {
    try {
      const legacy = localStorage.getItem('spine-scanner-theme');
      if (legacy === 'light' || legacy === 'dark') {
        localStorage.removeItem('spine-scanner-theme');
        updatePreferences({ theme: legacy });
      }
    } catch {
      // ignore
    }
  }, [updatePreferences]);

  useEffect(() => {
    if (user?.id) {
      loadFromCloud(user.id);
    }
  }, [user?.id, loadFromCloud]);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!user?.id) return;
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveToCloud(user.id), 800);
    return () => { clearTimeout(saveTimeoutRef.current); };
  }, [user?.id, preferences, saveToCloud]);
}
