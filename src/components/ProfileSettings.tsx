import React, { useMemo, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import { useBookStore } from '../store/useBookStore.ts';
import { useProfileStore } from '../store/useProfileStore.ts';
import { useAnalyticsStore } from '../store/useAnalyticsStore.ts';
import { useTheme } from '../hooks/useTheme.ts';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';
import { isSupabaseConfigured } from '../lib/supabase.ts';
import {
  X, User, Sun, Moon, Monitor, LayoutGrid, List, ArrowUpDown,
  CheckCircle, Layers, BarChart3, Tag, BookOpen, Clock3, Bookmark, Flame, ScanLine,
} from 'lucide-react';
import type { ProfilePreferences } from '../types.ts';
import s from './ProfileSettings.module.css';
import PrivacyPolicy from './PrivacyPolicy.tsx';

interface ProfileSettingsProps {
  onClose?: () => void;
  inline?: boolean;
}

const themeOptions: { value: ProfilePreferences['theme']; label: string; icon: React.ReactNode }[] = [
  { value: 'dark', label: 'Dark', icon: <Moon size={16} /> },
  { value: 'light', label: 'Light', icon: <Sun size={16} /> },
  { value: 'system', label: 'System', icon: <Monitor size={16} /> },
];

const sortOptions: { value: ProfilePreferences['librarySortBy']; label: string }[] = [
  { value: 'dateAdded', label: 'Date added' },
  { value: 'title', label: 'Title' },
  { value: 'author', label: 'Author' },
  { value: 'pageCount', label: 'Pages' },
];

const viewOptions: { value: ProfilePreferences['libraryViewMode']; label: string; icon: React.ReactNode }[] = [
  { value: 'grid', label: 'Grid', icon: <LayoutGrid size={16} /> },
  { value: 'list', label: 'List', icon: <List size={16} /> },
];

const statusOptions: { value: ProfilePreferences['libraryStatusFilter']; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'to-read', label: 'To Read' },
  { value: 'reading', label: 'Reading' },
  { value: 'read', label: 'Read' },
  { value: 'dnf', label: 'DNF' },
];

const statusSummary = [
  { key: 'read', label: 'Read', accent: '#22c55e' },
  { key: 'reading', label: 'Reading', accent: '#a855f7' },
  { key: 'to-read', label: 'Watchlist', accent: '#38bdf8' },
  { key: 'dnf', label: 'DNF', accent: '#ef4444' },
] as const;

const ProfileSettings: React.FC<ProfileSettingsProps> = ({ onClose, inline = false }) => {
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const { user, profile } = useAuthStore();
  const { books, shelves } = useBookStore();
  const { preferences, updatePreferences } = useProfileStore();
  const { setTheme } = useTheme();
  const focusTrapRef = useFocusTrap<HTMLDivElement>();
  const scanStats = useAnalyticsStore((state) => state.getSummary());
  const displayName = profile?.username ?? profile?.displayName ?? user?.user_metadata?.full_name ?? user?.email ?? 'Local reader';
  const avatarUrl = profile?.avatarUrl ?? user?.user_metadata?.avatar_url ?? null;
  const joinedLabel = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : 'This device';

  const summary = useMemo(() => {
    const total = books.length;
    const reading = books.filter((book) => book.status === 'reading').length;
    const read = books.filter((book) => book.status === 'read').length;
    const toRead = books.filter((book) => book.status === 'to-read').length;
    const dnf = books.filter((book) => book.status === 'dnf').length;
    const totalPages = books.reduce((sum, book) => sum + (book.pageCount || 0), 0);
    const readPages = books
      .filter((book) => book.status === 'read')
      .reduce((sum, book) => sum + (book.pageCount || 0), 0);
    const shelfCount = shelves.length;
    const completionRate = total > 0 ? Math.round((read / total) * 100) : 0;
    const recentBooks = [...books]
      .sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime())
      .slice(0, 4);

    const thisYear = new Date().getFullYear();
    const booksFinishedThisYear = books.filter((book) => {
      if (!book.finishedAt) return false;
      return new Date(book.finishedAt).getFullYear() === thisYear;
    });
    const pagesReadThisYear = booksFinishedThisYear.reduce(
      (sum, book) => sum + (book.pageCount || 0), 0
    );

    return {
      total,
      reading,
      read,
      toRead,
      dnf,
      totalPages,
      readPages,
      shelfCount,
      completionRate,
      recentBooks,
      booksThisYear: booksFinishedThisYear.length,
      pagesThisYear: pagesReadThisYear,
    };
  }, [books, shelves]);

  const content = (
    <div
      ref={inline ? undefined : focusTrapRef}
      className={`glass ${inline ? s.page : s.modal}`}
      onClick={(e) => !inline && e.stopPropagation()}
    >
      {!inline && onClose && (
        <button onClick={onClose} className={s.closeBtn} aria-label="Close settings">
          <X size={20} />
        </button>
      )}

      <h2 id="profile-settings-title" className={s.title}>Profile & Settings</h2>
      <p className={s.subtitle}>Your preferences are saved locally and synced when you sign in.</p>

      <div className={s.profileHero}>
        <div className={s.profileIdentity}>
          <div className={s.profileAvatarLarge}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="" width={72} height={72} />
            ) : <User size={34} />}
          </div>
          <div className={s.profileMeta}>
            <div className={s.profileEyebrow}>Reader profile</div>
            <div className={s.profileDisplayName}>{displayName}</div>
            <div className={s.profileSubline}>
              {user?.email ?? 'Saved locally on this device'}
            </div>
            <div className={s.profileBadges}>
              <span className={s.profileBadge}>
                <BookOpen size={14} />
                {summary.total} books
              </span>
              <span className={s.profileBadge}>
                <Clock3 size={14} />
                {summary.reading} reading
              </span>
              <span className={s.profileBadge}>
                <Bookmark size={14} />
                Since {joinedLabel}
              </span>
            </div>
          </div>
        </div>
        <div className={s.profileSpotlight}>
          <div className={s.spotlightLabel}>Library summary</div>
          <div className={s.spotlightValue}>{summary.completionRate}% finished</div>
          <div className={s.spotlightText}>
            {summary.read.toLocaleString()} read, {summary.toRead.toLocaleString()} queued, {summary.readPages.toLocaleString()} pages completed.
          </div>
        </div>
      </div>

      {!isSupabaseConfigured() && (
        <div className={s.localBadge}>
          <User size={16} /> Local profile - sign in to sync preferences across devices
        </div>
      )}

      <div className={s.summaryGrid}>
        <div className={s.summaryCard}>
          <div className={s.summaryLabel}>Library</div>
          <div className={s.summaryValue}>{summary.total}</div>
          <div className={s.summaryMeta}>books tracked</div>
        </div>
        <div className={s.summaryCard}>
          <div className={s.summaryLabel}>Completed</div>
          <div className={s.summaryValue}>{summary.read}</div>
          <div className={s.summaryMeta}>{summary.completionRate}% of library</div>
        </div>
        <div className={s.summaryCard}>
          <div className={s.summaryLabel}>Pages read</div>
          <div className={s.summaryValue}>{summary.readPages.toLocaleString()}</div>
          <div className={s.summaryMeta}>{summary.totalPages.toLocaleString()} total pages</div>
        </div>
        <div className={s.summaryCard}>
          <div className={s.summaryLabel}>Shelves</div>
          <div className={s.summaryValue}>{summary.shelfCount}</div>
          <div className={s.summaryMeta}>custom collections</div>
        </div>
        <div className={s.summaryCard}>
          <div className={s.summaryLabel}>This year</div>
          <div className={s.summaryValue}>{summary.booksThisYear}</div>
          <div className={s.summaryMeta}>{summary.pagesThisYear.toLocaleString()} pages finished</div>
        </div>
      </div>

      <div className={s.letterboxdPanel}>
        <div className={s.panelHeader}>
          <div>
            <h3 className={s.panelTitle}>Reading activity</h3>
            <p className={s.panelSubtitle}>A quick snapshot of how your library is moving.</p>
          </div>
          <div className={s.panelIcon}>
            <Flame size={16} />
          </div>
        </div>
        <div className={s.statusBar} aria-hidden="true">
          {statusSummary.map((item) => {
            const count = item.key === 'read'
              ? summary.read
              : item.key === 'reading'
                ? summary.reading
                : item.key === 'to-read'
                  ? summary.toRead
                  : summary.dnf;
            const width = summary.total > 0 ? `${Math.max((count / summary.total) * 100, count > 0 ? 8 : 0)}%` : '0%';
            return (
              <span
                key={item.key}
                className={s.statusBarSegment}
                style={{ width, background: item.accent }}
              />
            );
          })}
        </div>
        <div className={s.statusSummaryGrid}>
          {statusSummary.map((item) => {
            const count = item.key === 'read'
              ? summary.read
              : item.key === 'reading'
                ? summary.reading
                : item.key === 'to-read'
                  ? summary.toRead
                  : summary.dnf;
            return (
              <div key={item.key} className={s.statusSummaryCard}>
                <span className={s.statusDot} style={{ background: item.accent }} />
                <div className={s.statusSummaryValue}>{count}</div>
                <div className={s.statusSummaryLabel}>{item.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={s.letterboxdPanel}>
        <div className={s.panelHeader}>
          <div>
            <h3 className={s.panelTitle}>Recent additions</h3>
            <p className={s.panelSubtitle}>Newest books in your library, Letterboxd-card style.</p>
          </div>
        </div>
        {summary.recentBooks.length > 0 ? (
          <div className={s.recentGrid}>
            {summary.recentBooks.map((book) => (
              <article key={book.id} className={s.recentCard}>
                <div className={s.recentCover}>
                  {book.coverImg ? (
                    <img src={book.coverImg} alt="" />
                  ) : (
                    <div className={s.recentFallback}>
                      {book.title.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className={s.recentInfo}>
                  <div className={s.recentTitle}>{book.title}</div>
                  <div className={s.recentAuthor}>{book.author}</div>
                  <div className={s.recentMeta}>
                    {statusOptions.find((option) => option.value === book.status)?.label ?? book.status}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={s.emptyState}>
            Scan a few books to build your profile stats and recent activity.
          </div>
        )}
      </div>

      {scanStats.totalScans > 0 && (
        <div className={s.letterboxdPanel}>
          <div className={s.panelHeader}>
            <div>
              <h3 className={s.panelTitle}>Scan statistics</h3>
              <p className={s.panelSubtitle}>How your scanner has performed across all sessions.</p>
            </div>
            <div className={s.panelIcon}>
              <ScanLine size={16} />
            </div>
          </div>
          <div className={s.scanStatsGrid}>
            <div className={s.scanStatCard}>
              <div className={s.scanStatValue}>{scanStats.totalScans}</div>
              <div className={s.scanStatLabel}>Total scans</div>
            </div>
            <div className={s.scanStatCard}>
              <div className={s.scanStatValue} style={{ color: scanStats.successRate >= 75 ? '#22c55e' : scanStats.successRate >= 50 ? '#f59e0b' : '#ef4444' }}>
                {scanStats.successRate}%
              </div>
              <div className={s.scanStatLabel}>Success rate</div>
            </div>
            <div className={s.scanStatCard}>
              <div className={s.scanStatValue}>{scanStats.barcodeSuccesses}</div>
              <div className={s.scanStatLabel}>Barcode hits</div>
            </div>
            <div className={s.scanStatCard}>
              <div className={s.scanStatValue}>{scanStats.ocrSuccesses}</div>
              <div className={s.scanStatLabel}>OCR hits</div>
            </div>
          </div>
          {scanStats.barcodeSuccesses + scanStats.ocrSuccesses > 0 && (
            <div className={s.methodBar} aria-label={`Scan method split: ${scanStats.barcodeVsOcrRatio}`}>
              <div
                className={s.methodBarBarcode}
                style={{ width: `${Math.round((scanStats.barcodeSuccesses / (scanStats.barcodeSuccesses + scanStats.ocrSuccesses)) * 100)}%` }}
              />
            </div>
          )}
          {scanStats.barcodeSuccesses + scanStats.ocrSuccesses > 0 && (
            <p className={s.methodLabel}>{scanStats.barcodeVsOcrRatio}</p>
          )}
        </div>
      )}

      <div className={s.section}>
        <h3 className={s.sectionTitle}>Theme</h3>
        <div className={s.optionRow}>
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { updatePreferences({ theme: opt.value }); setTheme(opt.value); }}
              className={`${s.optBtn} ${preferences.theme === opt.value ? s.optBtnActive : ''}`}
              aria-pressed={preferences.theme === opt.value}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className={s.section}>
        <h3 className={s.sectionTitle}>Library defaults</h3>
        <div className={s.field}>
          <label className={s.label}>Sort by</label>
          <div className={s.optionRow}>
            {sortOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => updatePreferences({ librarySortBy: opt.value })}
                className={`${s.optBtn} ${s.optBtnSmall} ${preferences.librarySortBy === opt.value ? s.optBtnActive : ''}`}
                aria-pressed={preferences.librarySortBy === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className={s.field}>
          <label className={s.label}>Sort order</label>
          <button
            type="button"
            onClick={() => updatePreferences({ librarySortAsc: !preferences.librarySortAsc })}
            className={`${s.optBtn} ${s.optBtnSmall}`}
          >
            <ArrowUpDown size={14} />
            {preferences.librarySortAsc ? 'A -> Z' : 'Z -> A'}
          </button>
        </div>
        <div className={s.field}>
          <label className={s.label}>Default view</label>
          <div className={s.optionRow}>
            {viewOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => updatePreferences({ libraryViewMode: opt.value })}
                className={`${s.optBtn} ${preferences.libraryViewMode === opt.value ? s.optBtnActive : ''}`}
                aria-pressed={preferences.libraryViewMode === opt.value}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className={s.field}>
          <label className={s.label}>Default status filter</label>
          <div className={s.optionRow}>
            {statusOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => updatePreferences({ libraryStatusFilter: opt.value })}
                className={`${s.optBtn} ${s.optBtnSmall} ${preferences.libraryStatusFilter === opt.value ? s.optBtnActive : ''}`}
                aria-pressed={preferences.libraryStatusFilter === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={s.section}>
        <h3 className={s.sectionTitle}>Scanner</h3>
        <button
          type="button"
          onClick={() => updatePreferences({ batchModeDefault: !preferences.batchModeDefault })}
          className={`${s.toggleRow} ${preferences.batchModeDefault ? s.toggleRowActive : ''}`}
          aria-pressed={preferences.batchModeDefault}
        >
          <Layers size={18} />
          <div className={s.toggleLabel}>
            <span>Start in batch mode</span>
            <span className={s.toggleHint}>Stay on scanner after each add</span>
          </div>
          {preferences.batchModeDefault && <CheckCircle size={18} className={s.check} />}
        </button>
      </div>

      <div className={s.section}>
        <h3 className={s.sectionTitle}>Library shortcuts</h3>
        <button
          type="button"
          onClick={() => updatePreferences({ showStatsDefault: !preferences.showStatsDefault })}
          className={`${s.toggleRow} ${preferences.showStatsDefault ? s.toggleRowActive : ''}`}
          aria-pressed={preferences.showStatsDefault}
        >
          <BarChart3 size={18} />
          <div className={s.toggleLabel}>
            <span>Show stats by default</span>
          </div>
          {preferences.showStatsDefault && <CheckCircle size={18} className={s.check} />}
        </button>
        <button
          type="button"
          onClick={() => updatePreferences({ showShelvesDefault: !preferences.showShelvesDefault })}
          className={`${s.toggleRow} ${preferences.showShelvesDefault ? s.toggleRowActive : ''}`}
          aria-pressed={preferences.showShelvesDefault}
        >
          <Tag size={18} />
          <div className={s.toggleLabel}>
            <span>Show shelves by default</span>
          </div>
          {preferences.showShelvesDefault && <CheckCircle size={18} className={s.check} />}
        </button>
      </div>

      <div className={s.footerLinks}>
        <button
          type="button"
          onClick={() => setShowPrivacyPolicy(true)}
          className={s.footerLink}
        >
          Privacy Policy
        </button>
      </div>

      {showPrivacyPolicy && (
        <PrivacyPolicy onClose={() => setShowPrivacyPolicy(false)} />
      )}
    </div>
  );

  if (inline) {
    return <section aria-labelledby="profile-settings-title">{content}</section>;
  }

  return (
    <div className={s.overlay} role="dialog" aria-modal="true" aria-labelledby="profile-settings-title"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      {content}
    </div>
  );
};

export default ProfileSettings;
