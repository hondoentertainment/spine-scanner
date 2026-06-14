import React from 'react';
import type { BookEntry } from '../types.ts';
import { METADATA_SOURCE_LABEL } from '../types.ts';
import { applyMetadataPeerChoice, getMetadataConflictFlags } from '../lib/metadataPeers.ts';
import styles from './MetadataConflictPanel.module.css';

interface MetadataConflictPanelProps {
  book: BookEntry;
  onResolve: (updates: Partial<BookEntry>) => void;
}

function fieldLabel(key: keyof ReturnType<typeof getMetadataConflictFlags>): string {
  if (key === 'pageCount') return 'Page count';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

const MetadataConflictPanel: React.FC<MetadataConflictPanelProps> = ({ book, onResolve }) => {
  const google = book.metadataPeers?.google;
  const openLibrary = book.metadataPeers?.openLibrary;
  if (!google || !openLibrary) return null;

  const flags = getMetadataConflictFlags(book);
  if (!flags.author && !flags.pageCount && !flags.title) return null;

  const conflictFields = (Object.keys(flags) as Array<keyof typeof flags>).filter((k) => flags[k]);

  return (
    <section className={styles.panel} aria-labelledby={`metadata-conflict-${book.id}`}>
      <h3 id={`metadata-conflict-${book.id}`} className={styles.title}>
        Providers disagree
      </h3>
      <p className={styles.hint}>
        Choose which source to use for {conflictFields.map(fieldLabel).join(', ')}. Applying a source replaces those fields with the provider values.
      </p>
      <div className={styles.grid}>
        {(['google_books', 'open_library'] as const).map((provider) => {
          const peer = provider === 'google_books' ? google : openLibrary;
          const label = METADATA_SOURCE_LABEL[provider];
          const choiceSummary = [
            peer.title?.trim() || book.title,
            peer.author,
            peer.pageCount > 0 ? `${peer.pageCount} pages` : null,
          ].filter(Boolean).join(', ');
          return (
            <button
              key={provider}
              type="button"
              className={styles.choice}
              aria-label={`Use ${label} metadata: ${choiceSummary}`}
              aria-pressed={book.metadataSource === provider}
              onClick={() => {
                const updates = applyMetadataPeerChoice(book, provider);
                if (updates) onResolve(updates);
              }}
            >
              <span className={styles.choiceLabel}>{label}</span>
              <span className={styles.choiceField}>{peer.title?.trim() || book.title}</span>
              <span className={styles.choiceField}>{peer.author}</span>
              {peer.pageCount > 0 && (
                <span className={styles.choiceField}>{peer.pageCount} pages</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default MetadataConflictPanel;
