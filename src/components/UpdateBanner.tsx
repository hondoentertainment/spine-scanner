import { X, RefreshCw } from 'lucide-react';
import { useServiceWorkerUpdate } from '../hooks/useServiceWorkerUpdate.ts';

const bannerStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: '5rem',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.625rem 1rem',
  background: 'var(--primary, #6366f1)',
  color: '#fff',
  borderRadius: '0.75rem',
  boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
  fontSize: '0.875rem',
  fontWeight: 500,
  maxWidth: 'calc(100% - 2rem)',
};

const reloadButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
  padding: '0.35rem 0.75rem',
  background: 'rgba(255,255,255,0.2)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.35)',
  borderRadius: '0.5rem',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '0.8125rem',
  whiteSpace: 'nowrap',
};

const dismissButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  color: 'rgba(255,255,255,0.75)',
  cursor: 'pointer',
  padding: '0.25rem',
  borderRadius: '0.25rem',
  flexShrink: 0,
};

export default function UpdateBanner() {
  const { needsUpdate, updateApp, dismiss } = useServiceWorkerUpdate();

  if (!needsUpdate) return null;

  return (
    <div role="alert" style={bannerStyle}>
      <span>A new version is available</span>
      <button type="button" onClick={updateApp} style={reloadButtonStyle}>
        <RefreshCw size={14} /> Reload
      </button>
      <button
        type="button"
        onClick={dismiss}
        style={dismissButtonStyle}
        aria-label="Dismiss update notification"
      >
        <X size={16} />
      </button>
    </div>
  );
}
