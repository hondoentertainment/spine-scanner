import React from 'react';
import { pluralize } from '../utils/plural.ts';
import s from './CloudMergePrompt.module.css';

interface CloudMergePromptProps {
  bookCount: number;
  busy: boolean;
  error: string | null;
  onMerge: () => void;
  onLater: () => void;
}

const CloudMergePrompt: React.FC<CloudMergePromptProps> = ({
  bookCount,
  busy,
  error,
  onMerge,
  onLater,
}) => (
  <div className={s.overlay}>
    <div
      className={`glass ${s.dialog}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cloud-merge-title"
    >
      <h2 id="cloud-merge-title" className={s.title}>Add this device&apos;s books to your account?</h2>
      <p className={s.body}>
        {`You have ${pluralize(bookCount, 'book')} saved on this device. Merging copies them into your account and keeps every book already in the cloud. When the same book is on both, the copy on this device is kept. Nothing is deleted.`}
      </p>
      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.actions}>
        <button type="button" className={s.primary} onClick={onMerge} disabled={busy}>
          {busy ? 'Merging…' : 'Merge and sync'}
        </button>
        <button type="button" className={s.secondary} onClick={onLater} disabled={busy}>
          Not now
        </button>
      </div>
    </div>
  </div>
);

export default CloudMergePrompt;
