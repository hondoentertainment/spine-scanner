import React, { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import { isSupabaseConfigured } from '../lib/supabase.ts';
import { upsertProfile } from '../lib/profiles.ts';
import { accountIdentity } from '../lib/accountIdentity.ts';
import { INSTALLED_PWA_HINT, isInstalledPwa } from '../lib/googleAuth.ts';
import GoogleSignInButton from './GoogleSignInButton.tsx';
import { LogIn, LogOut, UserPlus, Cloud, AlertCircle, Loader, X, WifiOff, Settings, Mail, ArrowLeft, CheckCircle2, KeyRound, RefreshCw } from 'lucide-react';
import s from './AuthPanel.module.css';
import { formatRelativeTime } from '../utils/formatRelativeTime.ts';

interface AuthPanelProps {
  onSyncNow: () => void;
  syncing: boolean;
  lastSyncedAt: string | null;
  online: boolean;
  pendingChanges: number;
  syncFailedRecently?: boolean;
  onOpenProfile?: () => void;
}

type AuthMode = 'signin' | 'signup' | 'forgot' | 'reset-sent' | 'confirm-pending';

function buildSyncAnnouncement(
  syncing: boolean,
  online: boolean,
  pendingChanges: number,
  syncFailedRecently: boolean | undefined,
  lastSyncedAt: string | null,
): string {
  if (syncing) return 'Syncing your library to the cloud.';
  if (!online && pendingChanges > 0) {
    return `Offline. ${pendingChanges} local change${pendingChanges === 1 ? '' : 's'} will upload when you are back online.`;
  }
  if (pendingChanges > 0) {
    return `${pendingChanges} change${pendingChanges === 1 ? '' : 's'} not yet uploaded. Press Sync to save to the cloud.`;
  }
  if (syncFailedRecently && online) {
    return 'Last sync failed. Press Sync or Retry to try again.';
  }
  if (lastSyncedAt && online) {
    return `All changes synced. Last successful sync ${formatRelativeTime(lastSyncedAt)}.`;
  }
  return 'Library is up to date with the cloud.';
}

const AuthPanel: React.FC<AuthPanelProps> = ({ onSyncNow, syncing, lastSyncedAt, online, pendingChanges, syncFailedRecently, onOpenProfile }) => {
  const {
    user, profile, loading, error, confirmationPending,
    signIn, signUp, signInWithGoogle, signOut, loadProfile,
    resetPassword, resendConfirmation, clearError, clearConfirmation,
  } = useAuthStore();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPanel, setShowPanel] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(false);

  if (!isSupabaseConfigured()) return null;

  // Sync confirmation state from store
  if (confirmationPending && mode !== 'confirm-pending') {
    setMode('confirm-pending');
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signup') {
      const userId = await signUp(email, password, username.trim() || undefined);
      if (userId && username.trim()) {
        await upsertProfile(userId, { username: username.trim() });
        await loadProfile();
      }
      setPassword('');
    } else if (mode === 'signin') {
      await signIn(email, password);
      setPassword('');
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = resetEmail || email;
    if (!target) return;
    const ok = await resetPassword(target);
    if (ok) {
      setMode('reset-sent');
    }
  };

  const handleResendConfirmation = async () => {
    if (resendCooldown || !email) return;
    const ok = await resendConfirmation(email);
    if (ok) {
      setResendCooldown(true);
      setTimeout(() => setResendCooldown(false), 30_000);
    }
  };

  const resetToSignIn = () => {
    setMode('signin');
    setResetEmail('');
    clearError();
    clearConfirmation();
  };

  // === Signed-in user badge ===
  if (user) {
    const identity = accountIdentity(user, profile);
    const syncAnnouncement = buildSyncAnnouncement(syncing, online, pendingChanges, syncFailedRecently, lastSyncedAt);

    const syncBtnTitle = !online
      ? 'Connect to the internet to sync your library'
      : syncing
        ? 'Sync in progress…'
        : pendingChanges > 0
          ? 'Upload pending changes to the cloud'
          : 'Sync library to cloud now';

    return (
      <div className={s.wrap}>
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {syncAnnouncement}
        </div>

        {!online && (
          <div className={`glass ${s.offlineBadge}`}>
            <WifiOff size={12} /> Offline
          </div>
        )}

        {onOpenProfile && (
          <button type="button" onClick={onOpenProfile} className={`glass ${s.settingsBtn}`} aria-label="Profile and settings">
            <Settings size={16} />
          </button>
        )}
        <div className={`glass ${s.userBadge}`}>
          {identity.avatarUrl ? (
            <img src={identity.avatarUrl} alt="" className={s.avatar} width={32} height={32} decoding="async" />
          ) : (
            <Cloud size={14} style={{ color: online ? '#22c55e' : '#f59e0b' }} />
          )}
          <span className={s.identityText}>
            <span className={s.displayName}>{identity.name}</span>
            {identity.email && (
              <span className={s.email}>{identity.email}</span>
            )}
          </span>
        </div>

        <div className={s.syncCluster} role="group" aria-label="Cloud sync">
          <button
            type="button"
            onClick={onSyncNow}
            disabled={syncing || !online}
            title={syncBtnTitle}
            className={`glass ${s.syncBtn} ${syncing ? s.syncBtnSyncing : ''}`}
            aria-label={syncing ? 'Syncing library to cloud' : 'Sync library to cloud'}
            style={{
              color: !online ? 'var(--text-muted)' : syncing ? 'var(--text-muted)' : 'var(--accent-blue)',
              cursor: syncing || !online ? 'not-allowed' : 'pointer',
            }}
          >
            {syncing ? <Loader size={14} className="animate-spin" aria-hidden /> : <Cloud size={14} aria-hidden />}
            {syncing ? 'Syncing…' : 'Sync'}
            {pendingChanges > 0 && !syncing && (
              <span className={s.pendingBadge} style={{ background: online ? '#f59e0b' : '#ef4444' }}>
                {pendingChanges > 99 ? '99+' : pendingChanges}
              </span>
            )}
          </button>

          {lastSyncedAt && online && pendingChanges === 0 && !syncing && (
            <span className={s.syncedTime}>Synced {formatRelativeTime(lastSyncedAt)}</span>
          )}
          {pendingChanges > 0 && !syncing && (
            <span className={s.pendingText} style={{ color: online ? '#f59e0b' : '#ef4444' }}>
              {online
                ? `Saved on this device · ${pendingChanges} waiting to upload`
                : `${pendingChanges} local change${pendingChanges === 1 ? '' : 's'} · will sync when online`}
            </span>
          )}
          {syncFailedRecently && online && pendingChanges > 0 && !syncing && (
            <button type="button" onClick={onSyncNow} className={`glass ${s.retryBtn}`} aria-label="Retry sync now">
              <RefreshCw size={12} aria-hidden /> Retry
            </button>
          )}
        </div>

        <button type="button" onClick={signOut} className={`glass ${s.signOutBtn}`} aria-label="Sign out">
          <LogOut size={14} />
        </button>
      </div>
    );
  }

  // === Collapsed ===
  if (!showPanel) {
    return (
      <div className={s.wrap}>
        {onOpenProfile && (
          <button onClick={onOpenProfile} className={`glass ${s.settingsBtn}`} aria-label="Profile and settings">
            <Settings size={16} />
          </button>
        )}
        <div className={s.googleOffer}>
          <GoogleSignInButton
            onClick={() => void signInWithGoogle()}
            disabled={!online || loading}
            busy={loading}
          />
          {isInstalledPwa() && <p className={s.pwaHint}>{INSTALLED_PWA_HINT}</p>}
          {!online && (
            <p className={s.pwaHint}>You&apos;re offline. Continue with Google when you&apos;re connected.</p>
          )}
          {error && (
            <div className={s.errorBox} role="alert">
              <AlertCircle size={14} /> {error}
            </div>
          )}
          <button id="account-email-sign-in" type="button" onClick={() => setShowPanel(true)} className={`glass ${s.signInBtn}`}>
            Use email instead
          </button>
        </div>
      </div>
    );
  }

  // === Email confirmation pending ===
  if (mode === 'confirm-pending') {
    return (
      <div className={`glass ${s.formPanel}`}>
        <button onClick={() => { setShowPanel(false); resetToSignIn(); }}
          aria-label="Close" className={s.formClose}>
          <X size={16} />
        </button>
        <div className={s.successPanel}>
          <div className={s.successIcon}>
            <Mail size={28} />
          </div>
          <h3 className={s.formTitle}>Check your email</h3>
          <p className={s.formSubtitle}>
            We sent a confirmation link to <strong>{email}</strong>. Click the link to activate your account.
          </p>
          {error && (
            <div className={s.errorBox}>
              <AlertCircle size={14} /> {error}
            </div>
          )}
          <button type="button" onClick={handleResendConfirmation}
            disabled={loading || resendCooldown}
            className={s.resendBtn}>
            {loading ? <Loader size={14} className="animate-spin" /> : <Mail size={14} />}
            {resendCooldown ? 'Email sent! Check your inbox' : 'Resend confirmation email'}
          </button>
          <button type="button" onClick={resetToSignIn} className={s.modeBtn}>
            <ArrowLeft size={12} /> Back to sign in
          </button>
        </div>
      </div>
    );
  }

  // === Password reset sent ===
  if (mode === 'reset-sent') {
    return (
      <div className={`glass ${s.formPanel}`}>
        <button onClick={() => { setShowPanel(false); resetToSignIn(); }}
          aria-label="Close" className={s.formClose}>
          <X size={16} />
        </button>
        <div className={s.successPanel}>
          <div className={s.successIcon} style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
            <CheckCircle2 size={28} />
          </div>
          <h3 className={s.formTitle}>Reset link sent</h3>
          <p className={s.formSubtitle}>
            Check <strong>{resetEmail || email}</strong> for a password reset link. It may take a minute to arrive.
          </p>
          <button type="button" onClick={resetToSignIn} className={s.modeBtn}>
            <ArrowLeft size={12} /> Back to sign in
          </button>
        </div>
      </div>
    );
  }

  // === Forgot password form ===
  if (mode === 'forgot') {
    return (
      <div className={`glass ${s.formPanel}`}>
        <button onClick={() => { setShowPanel(false); resetToSignIn(); }}
          aria-label="Close" className={s.formClose}>
          <X size={16} />
        </button>
        <div className={s.formHeader}>
          <h3 className={s.formTitle}>Reset Password</h3>
          <p className={s.formSubtitle}>Enter your email and we'll send a reset link</p>
        </div>

        {error && (
          <div className={s.errorBox}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <form onSubmit={handleForgotPassword} className={s.form}>
          <input type="email" placeholder="Email address" value={resetEmail || email}
            onChange={(e) => setResetEmail(e.target.value)} required className={s.formInput} autoFocus />
          <button type="submit" disabled={loading || !online}
            className={s.submitBtn}
            style={{
              background: !online ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
              opacity: loading || !online ? 0.7 : 1,
              cursor: loading || !online ? 'not-allowed' : 'pointer',
            }}>
            {loading ? <Loader size={16} className="animate-spin" /> : <><KeyRound size={16} /> Send Reset Link</>}
          </button>
        </form>

        <div className={s.modeToggle}>
          <button onClick={resetToSignIn} className={s.modeBtn}>
            <ArrowLeft size={12} /> Back to sign in
          </button>
        </div>
      </div>
    );
  }

  // === Sign in / Sign up form ===
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
        <GoogleSignInButton
          onClick={() => void signInWithGoogle()}
          disabled={!online || loading}
          busy={loading}
          fullWidth
        />
        {isInstalledPwa() && <p className={s.pwaHint}>{INSTALLED_PWA_HINT}</p>}
        <div className={s.formDivider}>or</div>
        {mode === 'signup' && (
          <input type="text" placeholder="Username (optional)" value={username}
            onChange={(e) => setUsername(e.target.value)} autoComplete="username"
            className={s.formInput} />
        )}
        <input type="email" placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)} required className={s.formInput} />
        <input type="password" placeholder="Password (min 6 characters)" value={password}
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
        {mode === 'signin' && (
          <button onClick={() => { setMode('forgot'); clearError(); }} className={s.forgotBtn}>
            Forgot password?
          </button>
        )}
        <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); clearError(); }}
          className={s.modeBtn}>
          {mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
};

export default AuthPanel;
