import React, { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';
import { KeyRound, Loader, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import s from './PasswordReset.module.css';

interface PasswordResetProps {
  onComplete: () => void;
}

const PasswordReset: React.FC<PasswordResetProps> = ({ onComplete }) => {
  const { loading, error, updatePassword, clearError } = useAuthStore();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const trapRef = useFocusTrap<HTMLDivElement>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    const ok = await updatePassword(password);
    if (ok) {
      setSuccess(true);
      setTimeout(onComplete, 2000);
    }
  };

  if (success) {
    return (
      <div className={s.overlay}>
        <div className={s.modal} ref={trapRef}>
          <div className={s.successPanel}>
            <div className={s.successIcon}>
              <CheckCircle2 size={32} />
            </div>
            <h2 className={s.title}>Password Updated</h2>
            <p className={s.subtitle}>Your password has been changed successfully. Redirecting...</p>
          </div>
        </div>
      </div>
    );
  }

  const displayError = localError || error;

  return (
    <div className={s.overlay}>
      <div className={s.modal} ref={trapRef}>
        <div className={s.iconWrap}>
          <KeyRound size={28} />
        </div>
        <h2 className={s.title}>Set New Password</h2>
        <p className={s.subtitle}>Enter a new password for your account</p>

        {displayError && (
          <div className={s.errorBox}>
            <AlertCircle size={14} /> {displayError}
          </div>
        )}

        <form onSubmit={handleSubmit} className={s.form}>
          <div className={s.inputWrap}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="New password (min 6 characters)"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setLocalError(null); clearError(); }}
              required
              minLength={6}
              className={s.input}
              autoFocus
            />
            <button type="button" onClick={() => setShowPassword(v => !v)}
              className={s.eyeBtn} aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setLocalError(null); }}
            required
            minLength={6}
            className={s.input}
          />

          {password.length > 0 && (
            <div className={s.strengthBar}>
              <div className={s.strengthFill} style={{
                width: password.length < 6 ? '20%' : password.length < 10 ? '50%' : password.length < 14 ? '75%' : '100%',
                background: password.length < 6 ? '#ef4444' : password.length < 10 ? '#f59e0b' : '#22c55e',
              }} />
              <span className={s.strengthLabel}>
                {password.length < 6 ? 'Too short' : password.length < 10 ? 'Fair' : password.length < 14 ? 'Good' : 'Strong'}
              </span>
            </div>
          )}

          <button type="submit" disabled={loading || password.length < 6}
            className={s.submitBtn}>
            {loading ? <Loader size={16} className="animate-spin" /> : <><KeyRound size={16} /> Update Password</>}
          </button>
        </form>
      </div>
    </div>
  );
};

export default PasswordReset;
