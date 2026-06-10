import { useEffect, useCallback } from 'react';
import { useProfileStore } from '../store/useProfileStore.ts';

export type Theme = 'dark' | 'light' | 'high-contrast';
export type ThemePreference = 'dark' | 'light' | 'system' | 'high-contrast';

/** Order used by the cycle-toggle (light → dark → system → high-contrast → light). */
const THEME_CYCLE: ThemePreference[] = ['light', 'dark', 'system', 'high-contrast'];

/** Resolves a stored preference to an actually-applied theme. 'system' uses prefers-color-scheme. */
function resolveTheme(pref: ThemePreference): Theme {
  if (pref === 'light' || pref === 'dark' || pref === 'high-contrast') return pref;
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

  /** Match browser / PWA chrome to resolved theme (Android theme-color, iOS status bar). */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const themeColor =
      theme === 'light' ? '#f1f5f9'
      : theme === 'high-contrast' ? '#000000'
      : '#0f172a';
    document.getElementById('app-theme-color')?.setAttribute('content', themeColor);
    const apple = document.getElementById('apple-status-bar-style');
    if (apple) {
      apple.setAttribute('content', theme === 'light' ? 'default' : 'black-translucent');
    }
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

  /** Cycle through light → dark → system → high-contrast → light. */
  const toggleTheme = useCallback(() => {
    const idx = THEME_CYCLE.indexOf(themePreference);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    updatePreferences({ theme: next });
  }, [themePreference, updatePreferences]);

  const setTheme = useCallback((t: ThemePreference) => {
    updatePreferences({ theme: t });
  }, [updatePreferences]);

  return { theme, themePreference, toggleTheme, setTheme } as const;
};
