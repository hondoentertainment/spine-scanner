import React, { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import { isSupabaseConfigured } from '../lib/supabase.ts';
import { LogIn, LogOut, UserPlus, Cloud, CloudOff, AlertCircle, Loader, X, WifiOff } from 'lucide-react';
import s from './AuthPanel.module.css';

interface AuthPanelProps {
  onSyncNow: () => void;
  syncing: boolean;
  lastSynced: string | null;
  online: boolean;
  pendingChanges: number;
}

const AuthPanel: React.FC<AuthPanelProps> = ({ onSyncNow, syncing, lastSynced, online, pendingChanges }) => {
  const { user, loading, error, signIn, signUp, signOut, clearError } = useAuthStore();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPanel, setShowPanel] = useState(false);

  if (!isSupabaseConfigured()) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signup') await signUp(email, password);
    else await signIn(email, password);
    setPassword('');
  };

  // Signed-in user badge
  if (user) {
    return (
      <div className={s.wrap}>
        {!online && (
          <div className={`glass ${s.offlineBadge}`}>
            <WifiOff size={12} /> Offline
          </div>
        )}

        <div className={`glass ${s.userBadge}`}>
          <Cloud size={14} style={{ color: online ? '#22c55e' : '#f59e0b' }} />
          <span className={s.email}>{user.email}</span>
        </div>

        <button onClick={onSyncNow} disabled={syncing || !online}
          className={`glass ${s.syncBtn}`} aria-label="Sync library to cloud"
          style={{
            color: !online ? 'var(--text-muted)' : syncing ? 'var(--text-muted)' : 'var(--accent-blue)',
            cursor: syncing || !online ? 'not-allowed' : 'pointer',
          }}>
          {syncing ? <Loader size={14} className="animate-spin" /> : <Cloud size={14} />}
          {syncing ? 'Syncing...' : 'Sync'}
          {pendingChanges > 0 && !syncing && (
            <span className={s.pendingBadge}
              style={{ background: online ? '#f59e0b' : '#ef4444' }}>
              {pendingChanges > 99 ? '99+' : pendingChanges}
            </span>
          )}
        </button>

        {lastSynced && online && pendingChanges === 0 && (
          <span className={s.syncedTime}>Synced {new Date(lastSynced).toLocaleTimeString()}</span>
        )}
        {pendingChanges > 0 && !syncing && (
          <span className={s.pendingText} style={{ color: online ? '#f59e0b' : '#ef4444' }}>
            {pendingChanges} pending {online ? '' : '(offline)'}
          </span>
        )}

        <button onClick={signOut} className={`glass ${s.signOutBtn}`} aria-label="Sign out">
          <LogOut size={14} />
        </button>
      </div>
    );
  }

  // Collapsed
  if (!showPanel) {
    return (
      <button onClick={() => setShowPanel(true)} className={`glass ${s.signInBtn}`}>
        <CloudOff size={14} /> Sign in to sync
      </button>
    );
  }

  // Auth form
  return (
    <div className={`glass ${s.formPanel}`}>
      <button onClick={() => { setShowPanel(false); clearError(); }}
        aria-label="Close sign-in panel" className={s.formClose}>
        <X size={16} />
      </button>

      <div className={s.formHeader}>
        <h3 className={s.formTitle}>{mode === 'signin' ? 'Sign In' : 'Create Account'}</h3>
        <p className={s.formSubtitle}>Sync your library across devices</p>
      </div>

      {!online && (
        <div className={s.offlineWarning}>
          <WifiOff size={14} /> You're offline. Sign in when connected.
        </div>
      )}

      {error && (
        <div className={s.errorBox}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className={s.form}>
        <input type="email" placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)} required className={s.formInput} />
        <input type="password" placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)} required minLength={6} className={s.formInput} />
        <button type="submit" disabled={loading || !online}
          className={s.submitBtn}
          style={{
            background: !online ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
            opacity: loading || !online ? 0.7 : 1,
            cursor: loading || !online ? 'not-allowed' : 'pointer',
          }}>
          {loading ? <Loader size={16} className="animate-spin" /> :
            mode === 'signin' ? <><LogIn size={16} /> Sign In</> : <><UserPlus size={16} /> Create Account</>}
        </button>
      </form>

      <div className={s.modeToggle}>
        <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); clearError(); }}
          className={s.modeBtn}>
          {mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
};

export default AuthPanel;
