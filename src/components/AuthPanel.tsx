import React, { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import { isSupabaseConfigured } from '../lib/supabase.ts';
import { upsertProfile } from '../lib/profiles.ts';
import { LogIn, LogOut, UserPlus, Cloud, CloudOff, AlertCircle, Loader, X, WifiOff, Mail, ArrowLeft } from 'lucide-react';
import s from './AuthPanel.module.css';

interface AuthPanelProps {
  onSyncNow: () => void;
  syncing: boolean;
  lastSynced: string | null;
  online: boolean;
  pendingChanges: number;
}

const AuthPanel: React.FC<AuthPanelProps> = ({ onSyncNow, syncing, lastSynced, online, pendingChanges }) => {
  const { user, profile, loading, error, signIn, signUp, signInWithMagicLink, signInWithGoogle, signOut, loadProfile, clearError, magicLinkSent, clearMagicLinkSent } = useAuthStore();
  const [mode, setMode] = useState<'magic' | 'signin' | 'signup'>('magic');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPanel, setShowPanel] = useState(false);

  if (!isSupabaseConfigured()) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'magic') {
      await signInWithMagicLink(email);
    } else if (mode === 'signup') {
      const userId = await signUp(email, password, username.trim() || undefined);
      if (userId && username.trim()) {
        await upsertProfile(userId, { username: username.trim() });
        await loadProfile();
      }
    } else {
      await signIn(email, password);
    }
    if (mode !== 'magic') setPassword('');
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
          {(profile?.avatarUrl ?? user.user_metadata?.avatar_url) ? (
            <img src={profile?.avatarUrl ?? user.user_metadata?.avatar_url} alt="" className={s.avatar} width={18} height={18} />
          ) : (
            <Cloud size={14} style={{ color: online ? '#22c55e' : '#f59e0b' }} />
          )}
          <span className={s.displayName}>
            {profile?.username ?? profile?.displayName ?? user.user_metadata?.full_name ?? user.email}
          </span>
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

  // Magic link sent confirmation
  if (magicLinkSent) {
    return (
      <div className={`glass ${s.formPanel}`}>
        <button onClick={() => { setShowPanel(false); clearMagicLinkSent(); clearError(); }}
          aria-label="Close sign-in panel" className={s.formClose}>
          <X size={16} />
        </button>

        <div className={s.magicLinkSent}>
          <Mail size={32} style={{ color: 'var(--accent-blue)' }} />
          <h3 className={s.formTitle}>Check your email</h3>
          <p className={s.magicLinkText}>
            We sent a sign-in link to <strong>{email}</strong>. Click the link in the email to sign in.
          </p>
          <button
            type="button"
            onClick={() => signInWithMagicLink(email)}
            disabled={loading}
            className={s.resendBtn}
          >
            {loading ? <Loader size={14} className="animate-spin" /> : <Mail size={14} />}
            Resend link
          </button>
          <button
            type="button"
            onClick={() => { clearMagicLinkSent(); clearError(); }}
            className={s.modeBtn}
          >
            <ArrowLeft size={14} /> Back to sign in
          </button>
        </div>
      </div>
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
        <h3 className={s.formTitle}>
          {mode === 'magic' ? 'Sign In' : mode === 'signin' ? 'Sign In with Password' : 'Create Account'}
        </h3>
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
        <button
          type="button"
          onClick={() => signInWithGoogle()}
          disabled={loading || !online}
          className={s.googleBtn}
          style={{
            opacity: loading || !online ? 0.7 : 1,
            cursor: loading || !online ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? <Loader size={16} className="animate-spin" /> : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </>
          )}
        </button>
        <div className={s.formDivider}>or</div>

        {mode === 'signup' && (
          <input type="text" placeholder="Username (optional)" value={username}
            onChange={(e) => setUsername(e.target.value)} autoComplete="username"
            className={s.formInput} />
        )}
        <input type="email" placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)} required className={s.formInput} />

        {mode !== 'magic' && (
          <input type="password" placeholder="Password" value={password}
            onChange={(e) => setPassword(e.target.value)} required minLength={6} className={s.formInput} />
        )}

        <button type="submit" disabled={loading || !online}
          className={s.submitBtn}
          style={{
            background: !online ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
            opacity: loading || !online ? 0.7 : 1,
            cursor: loading || !online ? 'not-allowed' : 'pointer',
          }}>
          {loading ? <Loader size={16} className="animate-spin" /> :
            mode === 'magic' ? <><Mail size={16} /> Send Magic Link</> :
            mode === 'signin' ? <><LogIn size={16} /> Sign In</> :
            <><UserPlus size={16} /> Create Account</>}
        </button>
      </form>

      <div className={s.modeToggle}>
        {mode === 'magic' ? (
          <>
            <button onClick={() => { setMode('signin'); clearError(); }} className={s.modeBtn}>
              Use password instead
            </button>
            <button onClick={() => { setMode('signup'); clearError(); }} className={s.modeBtn}>
              Create an account
            </button>
          </>
        ) : mode === 'signin' ? (
          <>
            <button onClick={() => { setMode('magic'); clearError(); }} className={s.modeBtn}>
              Use magic link instead
            </button>
            <button onClick={() => { setMode('signup'); clearError(); }} className={s.modeBtn}>
              Need an account? Sign up
            </button>
          </>
        ) : (
          <>
            <button onClick={() => { setMode('magic'); clearError(); }} className={s.modeBtn}>
              Use magic link instead
            </button>
            <button onClick={() => { setMode('signin'); clearError(); }} className={s.modeBtn}>
              Already have an account? Sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthPanel;
