import React from 'react';
import { Sun, Moon, Monitor, Contrast } from 'lucide-react';
import type { ThemePreference } from '../hooks/useTheme.ts';
import styles from './ThemeToggle.module.css';

interface ThemeToggleProps {
  /** The user's stored preference — drives both icon and the next step in the cycle. */
  themePreference: ThemePreference;
  onToggle: () => void;
}

interface ThemeMeta {
  label: string;
  next: ThemePreference;
  icon: React.ReactNode;
}

const THEME_META: Record<ThemePreference, ThemeMeta> = {
  light:           { label: 'Light',         next: 'dark',          icon: <Sun size={14} /> },
  dark:            { label: 'Dark',          next: 'system',        icon: <Moon size={14} /> },
  system:          { label: 'System',        next: 'high-contrast', icon: <Monitor size={14} /> },
  'high-contrast': { label: 'High contrast', next: 'light',         icon: <Contrast size={14} /> },
};

const ThemeToggle: React.FC<ThemeToggleProps> = ({ themePreference, onToggle }) => {
  const meta = THEME_META[themePreference];
  const nextLabel = THEME_META[meta.next].label.toLowerCase();
  const label = `Theme: ${meta.label}. Switch to ${nextLabel}.`;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={styles.toggle}
      aria-label={label}
      title={label}
    >
      <span className={styles.iconWrap}>{meta.icon}</span>
    </button>
  );
};

export default ThemeToggle;
