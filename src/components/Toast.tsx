import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, X, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import styles from './Toast.module.css';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
  details?: string;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number;
  details?: string;
}

interface ToastContextValue {
  /** Show a toast. Pass message + optional type/duration, or use toastDetail for diagnostic info. */
  toast: (message: string, type?: ToastType, duration?: number, details?: string) => void;
  /** Show a diagnostic toast with expandable details for OCR/scanner troubleshooting. */
  toastDetail: (options: ToastOptions) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={18} />,
  error: <AlertCircle size={18} />,
  info: <Info size={18} />,
  warning: <AlertTriangle size={18} />,
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());
  const [confirmState, setConfirmState] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    setExpandedDetails((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const toggleDetails = useCallback((id: string) => {
    setExpandedDetails((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = 'info', duration = 3500, details?: string) => {
      const id = crypto.randomUUID();
      const d = details ? (type === 'error' ? 12000 : 6000) : duration;
      setToasts((prev) => [...prev, { id, message, type, duration: d, details }]);
      if (details && (type === 'error' || type === 'warning')) {
        setExpandedDetails((prev) => new Set(prev).add(id));
      }

      const timer = setTimeout(() => removeToast(id), d);
      timersRef.current.set(id, timer);
    },
    [removeToast],
  );

  const toastDetail = useCallback(
    (options: ToastOptions) => {
      const { message, type = 'error', duration = 12000, details } = options;
      toast(message, type, duration, details);
    },
    [toast],
  );

  const confirm = useCallback(
    (options: ConfirmOptions): Promise<boolean> =>
      new Promise((resolve) => {
        setConfirmState({ options, resolve });
      }),
    [],
  );

  const handleConfirm = (value: boolean) => {
    confirmState?.resolve(value);
    setConfirmState(null);
  };

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <ToastContext.Provider value={{ toast, confirm, toastDetail }}>
      {children}

      {/* Toast stack */}
      <div className={styles.container} role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`${styles.toast} ${styles[t.type]} ${t.details ? styles.toastWithDetails : ''}`}>
            <div className={styles.toastHeader}>
              <span className={styles.icon}>{icons[t.type]}</span>
              <span className={styles.message}>{t.message}</span>
              <button
                onClick={() => removeToast(t.id)}
                className={styles.dismiss}
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
            {t.details && (
              <div className={styles.detailsSection}>
                <button
                  type="button"
                  onClick={() => toggleDetails(t.id)}
                  className={styles.detailsToggle}
                  aria-expanded={expandedDetails.has(t.id)}
                  aria-controls={`toast-details-${t.id}`}
                >
                  {expandedDetails.has(t.id) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  <span>{expandedDetails.has(t.id) ? 'Hide diagnosis' : 'Show diagnosis'}</span>
                </button>
                {expandedDetails.has(t.id) && (
                  <pre id={`toast-details-${t.id}`} className={styles.detailsContent}>
                    {t.details}
                  </pre>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {confirmState && (
        <div className={styles.overlay} onClick={() => handleConfirm(false)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.dialogTitle}>{confirmState.options.title}</h3>
            <p className={styles.dialogMessage}>{confirmState.options.message}</p>
            <div className={styles.dialogActions}>
              <button
                onClick={() => handleConfirm(false)}
                className={styles.dialogCancel}
              >
                {confirmState.options.cancelLabel || 'Cancel'}
              </button>
              <button
                onClick={() => handleConfirm(true)}
                className={`${styles.dialogConfirm} ${confirmState.options.danger ? styles.dialogDanger : ''}`}
              >
                {confirmState.options.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
};
