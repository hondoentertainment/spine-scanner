import React, { useState } from 'react';
import { CheckSquare, Square, Trash2 } from 'lucide-react';
import { useBookStore } from '../store/useBookStore.ts';
import type { BookEntry } from '../types.ts';
import s from './BulkActions.module.css';

interface BulkActionsProps {
  selectedIds: string[];
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onChangeStatus: (status: BookEntry['status']) => void;
  onAssignShelf: (shelfId: string) => void;
  onRemoveSelected: () => void;
}

const STATUS_OPTIONS: { value: BookEntry['status']; label: string }[] = [
  { value: 'to-read', label: 'To Read' },
  { value: 'reading', label: 'Reading' },
  { value: 'read', label: 'Read' },
  { value: 'dnf', label: 'DNF' },
];

const BulkActions: React.FC<BulkActionsProps> = ({
  selectedIds,
  onSelectAll,
  onDeselectAll,
  onChangeStatus,
  onAssignShelf,
  onRemoveSelected,
}) => {
  const { shelves } = useBookStore();
  const [confirmRemove, setConfirmRemove] = useState(false);

  const count = selectedIds.length;
  if (count === 0) return null;

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as BookEntry['status'];
    if (value) {
      onChangeStatus(value);
      e.target.value = '';
    }
  };

  const handleShelfChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value) {
      onAssignShelf(value);
      e.target.value = '';
    }
  };

  const handleRemove = () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    onRemoveSelected();
    setConfirmRemove(false);
  };

  return (
    <div className={s.toolbar} data-testid="bulk-actions-toolbar">
      <span className={s.count}>{count} selected</span>

      <div className={s.separator} />

      {/* Select / Deselect All */}
      <button
        className={s.selectBtn}
        onClick={onSelectAll}
        aria-label="Select all"
      >
        <CheckSquare size={12} /> Select All
      </button>
      <button
        className={s.selectBtn}
        onClick={onDeselectAll}
        aria-label="Deselect all"
      >
        <Square size={12} /> Deselect All
      </button>

      <div className={s.separator} />

      {/* Change Status */}
      <select
        className={s.actionSelect}
        onChange={handleStatusChange}
        defaultValue=""
        aria-label="Change status"
      >
        <option value="" disabled>Change status...</option>
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      {/* Assign to Shelf */}
      {shelves.length > 0 && (
        <select
          className={s.actionSelect}
          onChange={handleShelfChange}
          defaultValue=""
          aria-label="Assign to shelf"
        >
          <option value="" disabled>Assign to shelf...</option>
          {shelves.map((sh) => (
            <option key={sh.id} value={sh.id}>{sh.name}</option>
          ))}
        </select>
      )}

      <div className={s.separator} />

      {/* Remove Selected */}
      <button
        className={s.removeBtn}
        onClick={handleRemove}
        aria-label={confirmRemove ? 'Confirm remove' : 'Remove selected'}
        data-testid="remove-selected-btn"
      >
        <Trash2 size={12} />
        {confirmRemove ? 'Confirm Remove?' : `Remove ${count}`}
      </button>
    </div>
  );
};

export default BulkActions;
