import React from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import { useProfileStore } from '../store/useProfileStore.ts';
import { useTheme } from '../hooks/useTheme.ts';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';
import { isSupabaseConfigured } from '../lib/supabase.ts';
import {
  X, User, Sun, Moon, Monitor, LayoutGrid, List, ArrowUpDown,
  CheckCircle, Layers, BarChart3, Tag,
} from 'lucide-react';
import type { ProfilePreferences } from '../types.ts';
import s from './ProfileSettings.module.css';

interface ProfileSettingsProps {
  onClose: () => void;
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

const ProfileSettings: React.FC<ProfileSettingsProps> = ({ onClose }) => {
  const { user, profile } = useAuthStore();
  const { preferences, updatePreferences } = useProfileStore();
  const { setTheme } = useTheme();
  const focusTrapRef = useFocusTrap<HTMLDivElement>();

  return (
    <div className={s.overlay} role="dialog" aria-modal="true" aria-labelledby="profile-settings-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={focusTrapRef} className={`glass ${s.modal}`} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className={s.closeBtn} aria-label="Close settings">
          <X size={20} />
        </button>

        <h2 id="profile-settings-title" className={s.title}>Profile & Settings</h2>
        <p className={s.subtitle}>Your preferences are saved locally and synced when you sign in.</p>

        {isSupabaseConfigured() && user && (
          <div className={s.profileCard}>
            <div className={s.profileAvatar}>
              {(profile?.avatarUrl ?? user.user_metadata?.avatar_url) ? (
                <img src={profile?.avatarUrl ?? user.user_metadata?.avatar_url} alt="" width={48} height={48} />
              ) : (
                <User size={28} />
              )}
            </div>
            <div className={s.profileInfo}>
              <div className={s.profileName}>
                {profile?.username ?? profile?.displayName ?? user.user_metadata?.full_name ?? user.email}
              </div>
              <div className={s.profileEmail}>{user.email}</div>
            </div>
          </div>
        )}

        {!isSupabaseConfigured() && (
          <div className={s.localBadge}>
            <User size={16} /> Local profile — sign in to sync preferences across devices
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
              {preferences.librarySortAsc ? 'A → Z' : 'Z → A'}
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
          >
            <Tag size={18} />
            <div className={s.toggleLabel}>
              <span>Show shelves by default</span>
            </div>
            {preferences.showShelvesDefault && <CheckCircle size={18} className={s.check} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileSettings;
