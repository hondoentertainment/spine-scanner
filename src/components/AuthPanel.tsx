import React, { useEffect, useId, useRef, useState } from 'react';
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

type AuthMode = 'signin' | 'password' | 'signup' | 'forgot' | 'reset-sent' | 'confirm-pending' | 'magic-sent';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailProblem(value: string): string | null {
  const email = value.trim();
  if (!email) return 'Enter your email address.';
  if (!EMAIL_PATTERN.test(email)) return 'Enter a valid email address.';
  return null;
}

function passwordProblem(value: string): string | null {
  if (!value) return 'Enter your password.';
  if (value.length < 6) return 'Use at least 6 characters.';
  return null;
}

function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className={s.errorBox} role="alert">
      <AlertCircle size={14} aria-hidden /> {message}
    </div>
  );
}

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
    user, profile, loading, error, confirmationPending, magicLinkSent,
    signIn, signUp, signInWithMagicLink, signInWithGoogle, signOut, loadProfile,
    resetPassword, resendConfirmation, clearError, clearConfirmation, clearMagicLinkSent,
  } = useAuthStore();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPanel, setShowPanel] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const submitLock = useRef(false);
  const titleId = useId();
  const emailId = useId();
  const passwordId = useId();
  const usernameId = useId();
  const emailErrorId = useId();
  const passwordErrorId = useId();

  useEffect(() => {
    if (confirmationPending) {
      setMode('confirm-pending');
      setShowPanel(true);
      return;
    }
    if (magicLinkSent) {
      setMode('magic-sent');
      setShowPanel(true);
    }
  }, [confirmationPending, magicLinkSent]);

  useEffect(() => {
    if (!showPanel) return;
    if (mode === 'magic-sent' || mode === 'confirm-pending' || mode === 'reset-sent') {
      successRef.current?.focus();
      return;
    }
    if (mode === 'password') {
      passwordRef.current?.focus();
      return;
    }
    emailRef.current?.focus();
  }, [showPanel, mode]);

  if (!isSupabaseConfigured()) return null;

  const runOnce = (action: () => Promise<unknown> | void) => {
    if (submitLock.current || loading) return;
    submitLock.current = true;
    void Promise.resolve(action()).finally(() => {
      submitLock.current = false;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const nextEmailError = emailProblem(email);
    const nextPasswordError = passwordProblem(password);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError) {
      emailRef.current?.focus();
      return;
    }
    if (nextPasswordError) {
      passwordRef.current?.focus();
      return;
    }
    if (mode === 'signup') {
      const userId = await signUp(email.trim(), password, username.trim() || undefined);
      if (userId && username.trim()) {
        await upsertProfile(userId, { username: username.trim() });
        await loadProfile();
      }
      setPassword('');
    } else {
      await signIn(email.trim(), password);
      setPassword('');
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const nextEmailError = emailProblem(email);
    setEmailError(nextEmailError);
    if (nextEmailError) {
      emailRef.current?.focus();
      return;
    }
    await signInWithMagicLink(email.trim());
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const target = (resetEmail || email).trim();
    const nextEmailError = emailProblem(target);
    setEmailError(nextEmailError);
    if (nextEmailError) {
      emailRef.current?.focus();
      return;
    }
    const ok = await resetPassword(target);
    if (ok) {
      setMode('reset-sent');
    }
  };

  const handleResendConfirmation = async () => {
    if (resendCooldown || loading || !email.trim()) return;
    const ok = await resendConfirmation(email.trim());
    if (ok) {
      setResendCooldown(true);
      setTimeout(() => setResendCooldown(false), 30_000);
    }
  };

  const resetToSignIn = () => {
    setMode('signin');
    setResetEmail('');
    setEmailError(null);
    setPasswordError(null);
    clearError();
    clearConfirmation();
    clearMagicLinkSent();
  };

  const closePanel = () => {
    setShowPanel(false);
    setEmailError(null);
    setPasswordError(null);
    clearError();
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

        <button type="button" onClick={() => runOnce(signOut)} className={`glass ${s.signOutBtn}`} aria-label="Sign out" disabled={loading}>
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
          <button type="button" onClick={onOpenProfile} className={`glass ${s.settingsBtn}`} aria-label="Profile and settings">
            <Settings size={16} />
          </button>
        )}
        <div className={s.googleOffer}>
          <GoogleSignInButton
            onClick={() => runOnce(signInWithGoogle)}
            disabled={!online || loading}
            busy={loading}
          />
          {isInstalledPwa() && <p className={s.pwaHint}>{INSTALLED_PWA_HINT}</p>}
          {!online && (
            <p className={s.pwaHint}>You&apos;re offline. Continue with Google when you&apos;re connected.</p>
          )}
          <AuthError message={error} />
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
      <div className={`glass ${s.formPanel}`} role="region" aria-labelledby={titleId}>
        <button type="button" onClick={() => { setShowPanel(false); resetToSignIn(); }}
          aria-label="Close" className={s.formClose}>
          <X size={16} />
        </button>
        <div className={s.successPanel}>
          <div className={s.successIcon}>
            <Mail size={28} aria-hidden />
          </div>
          <h3 id={titleId} ref={successRef} tabIndex={-1} className={s.formTitle}>Check your email</h3>
          <p className={s.formSubtitle}>
            We sent a confirmation link to <strong>{email}</strong>. Click the link to activate your account.
          </p>
          <AuthError message={error} />
          <button type="button" onClick={() => void handleResendConfirmation()}
            disabled={loading || resendCooldown}
            className={s.resendBtn}>
            {loading ? <Loader size={14} className="animate-spin" aria-hidden /> : <Mail size={14} aria-hidden />}
            {resendCooldown ? 'Email sent! Check your inbox' : 'Resend confirmation email'}
          </button>
          <button type="button" onClick={resetToSignIn} className={s.modeBtn}>
            <ArrowLeft size={12} aria-hidden /> Back to sign in
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'magic-sent') {
    return (
      <div className={`glass ${s.formPanel}`} role="region" aria-labelledby={titleId}>
        <button type="button" onClick={() => { setShowPanel(false); resetToSignIn(); }}
          aria-label="Close sign-in panel" className={s.formClose}>
          <X size={16} />
        </button>
        <div className={s.successPanel} role="status">
          <div className={s.successIcon}>
            <Mail size={28} aria-hidden />
          </div>
          <h3 id={titleId} ref={successRef} tabIndex={-1} className={s.formTitle}>Check your email</h3>
          <p className={s.formSubtitle}>
            We sent a sign-in link to <strong>{email}</strong>. Open it on this device to come back to this page.
          </p>
          <button type="button" onClick={resetToSignIn} className={s.modeBtn}>
            <ArrowLeft size={12} aria-hidden /> Use a different email
          </button>
        </div>
      </div>
    );
  }

  // === Password reset sent ===
  if (mode === 'reset-sent') {
    return (
      <div className={`glass ${s.formPanel}`} role="region" aria-labelledby={titleId}>
        <button type="button" onClick={() => { setShowPanel(false); resetToSignIn(); }}
          aria-label="Close" className={s.formClose}>
          <X size={16} />
        </button>
        <div className={s.successPanel} role="status">
          <div className={s.successIcon} style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
            <CheckCircle2 size={28} aria-hidden />
          </div>
          <h3 id={titleId} ref={successRef} tabIndex={-1} className={s.formTitle}>Reset link sent</h3>
          <p className={s.formSubtitle}>
            Check <strong>{resetEmail || email}</strong> for a password reset link. It may take a minute to arrive.
          </p>
          <button type="button" onClick={resetToSignIn} className={s.modeBtn}>
            <ArrowLeft size={12} aria-hidden /> Back to sign in
          </button>
        </div>
      </div>
    );
  }

  // === Forgot password form ===
  if (mode === 'forgot') {
    return (
      <div className={`glass ${s.formPanel}`} role="region" aria-labelledby={titleId}>
        <button type="button" onClick={() => { setShowPanel(false); resetToSignIn(); }}
          aria-label="Close" className={s.formClose}>
          <X size={16} />
        </button>
        <div className={s.formHeader}>
          <h3 id={titleId} className={s.formTitle}>Reset Password</h3>
          <p className={s.formSubtitle}>Enter your email and we&apos;ll send a reset link</p>
        </div>

        {!online && (
          <div className={s.offlineWarning}>
            <WifiOff size={14} aria-hidden /> You&apos;re offline. Sign in when connected.
          </div>
        )}
        <AuthError message={error} />

        <form onSubmit={(e) => runOnce(() => handleForgotPassword(e))} className={s.form} noValidate>
          <label className={s.label} htmlFor={emailId}>Email</label>
          <input id={emailId} ref={emailRef} type="email" inputMode="email" autoComplete="email"
            autoCapitalize="none" spellCheck={false} placeholder="you@example.com"
            value={resetEmail || email}
            onChange={(e) => { setResetEmail(e.target.value); setEmailError(null); }}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? emailErrorId : undefined}
            className={`${s.formInput} ${emailError ? s.inputError : ''}`} />
          {emailError && <p id={emailErrorId} className={s.fieldError} role="alert">{emailError}</p>}
          <button type="submit" disabled={loading || !online}
            className={s.submitBtn}
            aria-busy={loading || undefined}
            style={{
              background: !online ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
              opacity: loading || !online ? 0.7 : 1,
              cursor: loading || !online ? 'not-allowed' : 'pointer',
            }}>
            {loading ? <Loader size={16} className="animate-spin" aria-hidden /> : <><KeyRound size={16} aria-hidden /> Send Reset Link</>}
          </button>
        </form>

        <div className={s.modeToggle}>
          <button type="button" onClick={resetToSignIn} className={s.modeBtn}>
            <ArrowLeft size={12} aria-hidden /> Back to sign in
          </button>
        </div>
      </div>
    );
  }

  const passwordMode = mode === 'password' || mode === 'signup';
  const title = mode === 'signup' ? 'Create Account' : 'Sign in';
  const subtitle = mode === 'signup'
    ? 'Create an account to sync your library'
    : 'Google, a sign-in link, or your password';

  return (
    <div className={`glass ${s.formPanel}`} role="region" aria-labelledby={titleId}>
      <button type="button" onClick={closePanel}
        aria-label="Close sign-in panel" className={s.formClose}>
        <X size={16} />
      </button>

      <div className={s.formHeader}>
        <h3 id={titleId} className={s.formTitle}>{title}</h3>
        <p className={s.formSubtitle}>{subtitle}</p>
      </div>

      {!online && (
        <div className={s.offlineWarning}>
          <WifiOff size={14} aria-hidden /> You&apos;re offline. Sign in when connected.
        </div>
      )}

      <AuthError message={error} />

      <form onSubmit={(e) => runOnce(() => (passwordMode ? handleSubmit(e) : handleMagicLink(e)))} className={s.form} noValidate>
        <GoogleSignInButton
          onClick={() => runOnce(signInWithGoogle)}
          disabled={!online || loading}
          busy={loading}
          fullWidth
        />
        {isInstalledPwa() && <p className={s.pwaHint}>{INSTALLED_PWA_HINT}</p>}
        <div className={s.formDivider}>or use email</div>
        {mode === 'signup' && (
          <>
            <label className={s.label} htmlFor={usernameId}>Username (optional)</label>
            <input id={usernameId} type="text" placeholder="Username" value={username}
              onChange={(e) => setUsername(e.target.value)} autoComplete="username"
              className={s.formInput} />
          </>
        )}
        <label className={s.label} htmlFor={emailId}>Email</label>
        <input id={emailId} ref={emailRef} type="email" inputMode="email" autoComplete="email"
          autoCapitalize="none" spellCheck={false} placeholder="you@example.com" value={email}
          onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? emailErrorId : undefined}
          className={`${s.formInput} ${emailError ? s.inputError : ''}`} />
        {emailError && <p id={emailErrorId} className={s.fieldError} role="alert">{emailError}</p>}
        {passwordMode && (
          <>
            <label className={s.label} htmlFor={passwordId}>Password</label>
            <input id={passwordId} ref={passwordRef} type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder="At least 6 characters" value={password}
              onChange={(e) => { setPassword(e.target.value); setPasswordError(null); }}
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? passwordErrorId : undefined}
              className={`${s.formInput} ${passwordError ? s.inputError : ''}`} />
            {passwordError && <p id={passwordErrorId} className={s.fieldError} role="alert">{passwordError}</p>}
          </>
        )}
        <button type="submit" disabled={loading || !online}
          className={s.submitBtn}
          aria-busy={loading || undefined}
          style={{
            background: !online ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
            opacity: loading || !online ? 0.7 : 1,
            cursor: loading || !online ? 'not-allowed' : 'pointer',
          }}>
          {loading ? <Loader size={16} className="animate-spin" aria-hidden /> :
            mode === 'signup' ? <><UserPlus size={16} aria-hidden /> Create Account</> :
            passwordMode ? <><LogIn size={16} aria-hidden /> Sign In</> :
            <><Mail size={16} aria-hidden /> Email me a sign-in link</>}
        </button>
      </form>

      <div className={s.modeToggle}>
        {mode === 'signin' && (
          <button type="button" onClick={() => { setMode('password'); clearError(); setEmailError(null); }} className={s.modeBtn}>
            Sign in with a password instead
          </button>
        )}
        {mode === 'password' && (
          <button type="button" onClick={() => { setMode('signin'); clearError(); setPasswordError(null); }} className={s.modeBtn}>
            Email me a link instead
          </button>
        )}
        {mode !== 'signup' && (
          <button type="button" onClick={() => { setMode('forgot'); clearError(); setEmailError(null); }} className={s.forgotBtn}>
            Forgot password?
          </button>
        )}
        <button type="button" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); clearError(); setEmailError(null); setPasswordError(null); }}
          className={s.modeBtn}>
          {mode === 'signup' ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
        </button>
      </div>
    </div>
  );
};

export default AuthPanel;
