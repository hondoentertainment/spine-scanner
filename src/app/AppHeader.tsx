import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { BookOpen, Home, Library, Scan, User } from 'lucide-react';
import AuthPanel from '../components/AuthPanel.tsx';
import ThemeToggle from '../components/ThemeToggle.tsx';
import styles from '../components/App.module.css';
import { preloadHome, preloadLibrary, preloadProfile, preloadScanView, preloadScanner } from './lazyViews.ts';
import type { AppView } from './publicPages.ts';
import { isMvpMode } from '../lib/appMode.ts';
import { addBreadcrumb } from '../lib/errorMonitoring.ts';
import { isSupabaseConfigured } from '../lib/supabase.ts';
import { useAuthStore } from '../store/useAuthStore.ts';
import { useTheme } from '../hooks/useTheme.ts';
import { uiContracts } from '../testing/uiContracts.ts';

type AppHeaderProps = {
  pathname: string;
  brandingSubtitle: string;
  online: boolean;
  pendingChanges: number;
  flushing: boolean;
  lastSyncedAt: string | null;
  syncFailedRecently: boolean;
  onSyncNow: () => void;
  onOpenProfile: () => void;
  onAnnounce: (message: string) => void;
};

export default function AppHeader({
  pathname,
  brandingSubtitle,
  online,
  pendingChanges,
  flushing,
  lastSyncedAt,
  syncFailedRecently,
  onSyncNow,
  onOpenProfile,
  onAnnounce,
}: AppHeaderProps) {
  const { user } = useAuthStore();
  const { themePreference, toggleTheme } = useTheme();
  const navItems: Array<{ key: AppView; label: string; shortLabel: string; icon: ReactNode }> = [
    ...(isMvpMode()
      ? []
      : [{ key: 'home' as const, label: 'Home', shortLabel: 'Home', icon: <Home size={20} strokeWidth={2} aria-hidden /> }]),
    { key: 'library', label: 'Library', shortLabel: 'Library', icon: <Library size={20} strokeWidth={2} aria-hidden /> },
    { key: 'scan', label: 'Scan', shortLabel: 'Scan', icon: <Scan size={22} strokeWidth={2} aria-hidden /> },
    { key: 'profile', label: 'Profile', shortLabel: 'Profile', icon: <User size={20} strokeWidth={2} aria-hidden /> },
  ];

  const warmRoute = (key: AppView) => {
    if (key === 'home') void preloadHome();
    if (key === 'scan') {
      void preloadScanView();
      void preloadScanner();
    }
    if (key === 'library') void preloadLibrary();
    if (key === 'profile') void preloadProfile();
  };

  return (
    <header className={`${styles.header} ${pathname === '/scan' ? styles.headerOnScan : ''}`.trim()}>
      <div className={styles.headerTop}>
        <div className={styles.branding}>
          <NavLink
            to={isMvpMode() ? '/scan' : '/home'}
            className={styles.brandLinkBlock}
            onClick={() => onAnnounce(isMvpMode() ? 'Scanner view' : 'Home feed')}
          >
            <div className={styles.logoBox}>
              <BookOpen size={28} color="white" aria-hidden />
            </div>
            <div className={styles.brandCopy}>
              <h1 className={styles.appTitle}>
                Spine<span className={styles.titleAccent}>Scanner</span>
              </h1>
              <p className={styles.subtitle}>{brandingSubtitle}</p>
            </div>
          </NavLink>
        </div>

        <div className={styles.headerRight}>
          {isSupabaseConfigured() && user && pendingChanges > 0 && (
            <button
              type="button"
              className={styles.headerSyncPill}
              onClick={() => void onSyncNow()}
              disabled={flushing || !online}
              aria-label={
                pendingChanges === 1
                  ? 'Sync one pending change to the cloud'
                  : `Sync ${pendingChanges} pending changes to the cloud`
              }
            >
              {flushing ? 'Syncing…' : !online ? 'Offline' : `${pendingChanges} to sync`}
            </button>
          )}
          <ThemeToggle themePreference={themePreference} onToggle={toggleTheme} />
          <AuthPanel
            onSyncNow={onSyncNow}
            syncing={flushing}
            lastSyncedAt={lastSyncedAt}
            online={online}
            pendingChanges={pendingChanges}
            syncFailedRecently={syncFailedRecently}
            onOpenProfile={onOpenProfile}
          />
        </div>
      </div>

      <nav className={`glass ${styles.nav}`} aria-label="Main navigation">
        {navItems.map(({ key, shortLabel, icon }) => {
          const to = `/${key}`;
          const announcements: Record<AppView, string> = {
            home: 'Home feed',
            scan: 'Scanner view',
            library: 'Library view',
            profile: 'Profile view',
          };
          return (
            <NavLink
              key={key}
              to={to}
              end
              onClick={() => { onAnnounce(announcements[key]); addBreadcrumb('navigation', 'Route changed', { path: to }); }}
              onMouseEnter={() => warmRoute(key)}
              onFocus={() => warmRoute(key)}
              className={({ isActive }) =>
                `${styles.navBtn} ${key === 'scan' ? styles.navBtnScan : ''} ${isActive ? styles.navBtnActive : ''}`.trim()}
              data-testid={uiContracts.navTabTestId(key)}
            >
              <span className={styles.navIcon}>{icon}</span>
              <span className={styles.navLabel}>{shortLabel}</span>
            </NavLink>
          );
        })}
      </nav>
    </header>
  );
}
