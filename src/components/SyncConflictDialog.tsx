import { useState } from 'react';
import type { SyncConflict } from '../utils/syncConflictResolver';
import styles from './SyncConflictDialog.module.css';

interface Props {
  conflicts: SyncConflict[];
  onResolve: (resolved: SyncConflict[]) => void;
  onCancel: () => void;
}

export default function SyncConflictDialog({ conflicts, onResolve, onCancel }: Props) {
  const [resolved, setResolved] = useState<SyncConflict[]>(
    conflicts.map((c) => ({ ...c })),
  );

  const updateResolution = (
    id: string,
    resolution: 'local' | 'remote' | 'manual',
    manualValue?: string,
  ) => {
    setResolved((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const value =
          resolution === 'local'
            ? c.localValue
            : resolution === 'remote'
              ? c.remoteValue
              : manualValue ?? c.localValue;
        return { ...c, resolution, resolvedValue: value };
      }),
    );
  };

  const resolveAllLocal = () => {
    setResolved((prev) =>
      prev.map((c) => ({
        ...c,
        resolution: 'local' as const,
        resolvedValue: c.localValue,
      })),
    );
  };

  const resolveAllRemote = () => {
    setResolved((prev) =>
      prev.map((c) => ({
        ...c,
        resolution: 'remote' as const,
        resolvedValue: c.remoteValue,
      })),
    );
  };

  const allResolved = resolved.every((c) => c.resolution != null);

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <h2 className={styles.title}>Resolve Sync Conflicts</h2>
        <p className={styles.subtitle}>
          {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} detected.
          Choose which value to keep for each field.
        </p>

        <div className={styles.bulkActions}>
          <button className={styles.bulkBtn} onClick={resolveAllLocal}>
            Resolve All (Local Wins)
          </button>
          <button className={styles.bulkBtn} onClick={resolveAllRemote}>
            Resolve All (Remote Wins)
          </button>
        </div>

        <div className={styles.conflictList}>
          {resolved.map((c) => (
            <div key={c.id} className={styles.conflictCard}>
              <div className={styles.conflictHeader}>
                <span className={styles.fieldLabel}>{c.field}</span>
                <span className={styles.bookId}>Book: {c.bookId.slice(0, 8)}...</span>
              </div>

              <div className={styles.values}>
                <label className={styles.valueOption}>
                  <input
                    type="radio"
                    name={c.id}
                    checked={c.resolution === 'local'}
                    onChange={() => updateResolution(c.id, 'local')}
                  />
                  <div className={styles.valueContent}>
                    <span className={styles.valueLabel}>Local</span>
                    <span className={styles.valueText}>
                      {c.localValue || '(empty)'}
                    </span>
                  </div>
                </label>

                <label className={styles.valueOption}>
                  <input
                    type="radio"
                    name={c.id}
                    checked={c.resolution === 'remote'}
                    onChange={() => updateResolution(c.id, 'remote')}
                  />
                  <div className={styles.valueContent}>
                    <span className={styles.valueLabel}>Remote</span>
                    <span className={styles.valueText}>
                      {c.remoteValue || '(empty)'}
                    </span>
                  </div>
                </label>

                <label className={styles.valueOption}>
                  <input
                    type="radio"
                    name={c.id}
                    checked={c.resolution === 'manual'}
                    onChange={() => updateResolution(c.id, 'manual', c.localValue)}
                  />
                  <div className={styles.valueContent}>
                    <span className={styles.valueLabel}>Manual</span>
                    {c.resolution === 'manual' && (
                      <input
                        type="text"
                        className={styles.manualInput}
                        value={c.resolvedValue ?? ''}
                        onChange={(e) =>
                          updateResolution(c.id, 'manual', e.target.value)
                        }
                      />
                    )}
                  </div>
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.dialogActions}>
          <button
            className={styles.applyBtn}
            disabled={!allResolved}
            onClick={() => onResolve(resolved)}
          >
            Apply Resolutions
          </button>
          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
