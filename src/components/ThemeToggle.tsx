import React from 'react';
import { Sun, Moon } from 'lucide-react';
import type { Theme } from '../hooks/useTheme.ts';
import styles from './ThemeToggle.module.css';

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onToggle }) => (
  <button
    onClick={onToggle}
    className={styles.toggle}
    aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
  >
    <span className={`${styles.iconWrap} ${theme === 'dark' ? styles.active : ''}`}>
      <Moon size={14} />
    </span>
    <span className={`${styles.iconWrap} ${theme === 'light' ? styles.active : ''}`}>
      <Sun size={14} />
    </span>
    <span
      className={styles.slider}
      style={{ transform: theme === 'light' ? 'translateX(100%)' : 'translateX(0)' }}
    />
  </button>
);

export default ThemeToggle;
