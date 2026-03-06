import { useEffect, useCallback } from 'react';
import { useProfileStore } from '../store/useProfileStore.ts';

export type Theme = 'dark' | 'light';

/** Resolves 'system' to actual theme based on prefers-color-scheme */
function resolveTheme(pref: 'dark' | 'light' | 'system'): Theme {
  if (pref === 'light' || pref === 'dark') return pref;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

export const useTheme = () => {
  const { preferences, updatePreferences } = useProfileStore();
  const themePreference = preferences.theme;
  const theme = resolveTheme(themePreference);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // When theme is 'system', react to OS preference changes
  useEffect(() => {
    if (themePreference !== 'system') return;
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!mq) return;
    const handler = () => {
      document.documentElement.setAttribute('data-theme', mq.matches ? 'light' : 'dark');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [themePreference]);

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    updatePreferences({ theme: next });
  }, [theme, updatePreferences]);

  const setTheme = useCallback((t: 'dark' | 'light' | 'system') => {
    updatePreferences({ theme: t });
  }, [updatePreferences]);

  return { theme, themePreference, toggleTheme, setTheme } as const;
};
