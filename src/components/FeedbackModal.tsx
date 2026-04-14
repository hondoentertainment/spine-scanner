import { useEffect, useId, useRef, useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { useFocusTrapEffect } from '../hooks/useFocusTrap.ts';
import styles from './FeedbackModal.module.css';

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  supportEmail?: string;
  securityEmail?: string;
  diagnosticsText: string;
}

export default function FeedbackModal({
  open,
  onClose,
  supportEmail,
  securityEmail,
  diagnosticsText,
}: FeedbackModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState('');
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  useFocusTrapEffect(open, dialogRef);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const contact = supportEmail ?? securityEmail;
  const subject = encodeURIComponent('SpineScanner feedback');
  const bodyParts = [
    note.trim() && `Message:\n${note.trim()}\n`,
    '---',
    'Diagnostics (if any):',
    diagnosticsText || '(none)',
  ];
  const body = encodeURIComponent(bodyParts.filter(Boolean).join('\n'));
  const mailto =
    contact != null && contact !== ''
      ? `mailto:${contact}?subject=${subject}&body=${body}`
      : null;

  const copyDiagnostics = async () => {
    if (!diagnosticsText || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setCopyStatus('Clipboard unavailable.');
      return;
    }
    try {
      await navigator.clipboard.writeText(diagnosticsText);
      setCopyStatus('Diagnostics copied.');
    } catch {
      setCopyStatus('Could not copy.');
    }
  };

  return (
    <div className={styles.overlay} role="presentation">
      <div className={styles.backdrop} aria-hidden="true" onClick={onClose} />
      <div
        ref={dialogRef}
        className={`glass ${styles.dialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.header}>
          <span className={styles.icon} aria-hidden>
            <MessageSquare size={20} />
          </span>
          <h2 id={titleId} className={styles.title}>
            Send feedback
          </h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close feedback dialog">
            <X size={18} />
          </button>
        </div>
        <p className={styles.lead}>
          Describe what happened or what you would like improved. You can attach diagnostics so we can reproduce issues
          faster.
        </p>
        <label className={styles.label} htmlFor="feedback-note">
          Your message (optional)
        </label>
        <textarea
          id="feedback-note"
          className={styles.textarea}
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What were you trying to do?"
        />
        <div className={styles.actions}>
          {mailto ? (
            <a className={styles.primary} href={mailto}>
              Open email draft
            </a>
          ) : (
            <p className={styles.muted}>Set VITE_SUPPORT_EMAIL so email drafts can open in your mail app.</p>
          )}
          <button type="button" className={styles.secondary} onClick={() => void copyDiagnostics()}>
            Copy diagnostics
          </button>
        </div>
        {copyStatus && <p className={styles.muted}>{copyStatus}</p>}
      </div>
    </div>
  );
}
