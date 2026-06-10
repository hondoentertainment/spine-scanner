import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import changelog from '../changelog.json';
import s from './ChangelogModal.module.css';

interface ChangelogEntry {
  version: string;
  date: string;
  items: string[];
}

interface ChangelogModalProps {
  open: boolean;
  onClose: () => void;
}

const ChangelogModal: React.FC<ChangelogModalProps> = ({ open, onClose }) => {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Focus the close button when the modal opens
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        closeBtnRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const entries = changelog as ChangelogEntry[];

  return (
    <div
      className={s.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="What's new"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`glass ${s.modal}`}>
        <div className={s.header}>
          <h2 className={s.title}>What's new</h2>
          <button
            ref={closeBtnRef}
            type="button"
            className={s.closeBtn}
            aria-label="Close changelog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        {entries.map((entry, index) => (
          <React.Fragment key={entry.version}>
            {index > 0 && <hr className={s.divider} />}
            <section className={s.entry}>
              <div className={s.entryHeader}>
                <span className={s.version}>{entry.version}</span>
                <span className={s.date}>{entry.date}</span>
              </div>
              <ul className={s.itemList}>
                {entry.items.map((item) => (
                  <li key={item} className={s.item}>{item}</li>
                ))}
              </ul>
            </section>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default ChangelogModal;
