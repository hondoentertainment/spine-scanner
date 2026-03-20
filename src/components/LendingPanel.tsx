import React, { useState } from 'react';
import { useLendingStore } from '../store/useLendingStore.ts';
import { useActivityStore } from '../store/useActivityStore.ts';
import { getActiveLoan, isOverdue, getDaysUntilDue } from '../utils/lendingUtils.ts';
import type { BookEntry } from '../types.ts';
import { HandHelping, RotateCcw, AlertTriangle, Send } from 'lucide-react';
import s from './LendingPanel.module.css';

interface LendingPanelProps {
  book: BookEntry;
}

const LendingPanel: React.FC<LendingPanelProps> = ({ book }) => {
  const { records, addRecord, returnBook } = useLendingStore();
  const { addEntry } = useActivityStore();
  const [showForm, setShowForm] = useState(false);
  const [borrowerName, setBorrowerName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  const activeLoan = getActiveLoan(book.id, records);
  const history = records.filter((r) => r.bookId === book.id && r.returnedDate);

  const handleLend = () => {
    if (!borrowerName.trim()) return;
    const record = {
      id: crypto.randomUUID(),
      bookId: book.id,
      borrowerName: borrowerName.trim(),
      lentDate: new Date().toISOString(),
      dueDate: dueDate || undefined,
      notes: notes.trim() || undefined,
    };
    addRecord(record);
    addEntry({
      type: 'book_lent',
      bookId: book.id,
      bookTitle: book.title,
      detail: `Lent to ${borrowerName.trim()}`,
    });
    setBorrowerName('');
    setDueDate('');
    setNotes('');
    setShowForm(false);
  };

  const handleReturn = () => {
    if (!activeLoan) return;
    returnBook(activeLoan.id);
    addEntry({
      type: 'book_returned',
      bookId: book.id,
      bookTitle: book.title,
      detail: `Returned by ${activeLoan.borrowerName}`,
    });
  };

  const overdue = activeLoan ? isOverdue(activeLoan) : false;
  const daysUntil = activeLoan ? getDaysUntilDue(activeLoan) : null;

  return (
    <div className={s.panel}>
      {activeLoan ? (
        <div className={s.activeLoan}>
          <div className={s.activeLoanHeader}>
            <span className={s.activeLoanTitle}>
              <HandHelping size={14} />
              Lent to {activeLoan.borrowerName}
            </span>
            <button className={s.returnBtn} onClick={handleReturn}>
              <RotateCcw size={12} /> Mark Returned
            </button>
          </div>
          <div className={s.loanDetail}>
            Lent on {new Date(activeLoan.lentDate).toLocaleDateString()}
            {activeLoan.dueDate && (
              <> &middot; Due {new Date(activeLoan.dueDate).toLocaleDateString()}</>
            )}
          </div>
          {overdue && (
            <span className={s.overdueBadge}>
              <AlertTriangle size={12} />
              Overdue{daysUntil !== null ? ` by ${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? 's' : ''}` : ''}
            </span>
          )}
          {activeLoan.notes && <div className={s.loanDetail}>{activeLoan.notes}</div>}
        </div>
      ) : showForm ? (
        <div className={s.form}>
          <h4 className={s.formTitle}>Lend this book</h4>
          <input
            className={s.input}
            placeholder="Borrower name"
            value={borrowerName}
            onChange={(e) => setBorrowerName(e.target.value)}
            autoFocus
          />
          <div className={s.formRow}>
            <input
              className={s.input}
              type="date"
              placeholder="Due date (optional)"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={{ flex: 1 }}
            />
          </div>
          <input
            className={s.input}
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className={s.formActions}>
            <button className={s.submitBtn} onClick={handleLend} disabled={!borrowerName.trim()}>
              <Send size={12} /> Lend
            </button>
            <button className={s.cancelBtn} onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className={s.lendBtn} onClick={() => setShowForm(true)}>
          <HandHelping size={16} /> Lend this book
        </button>
      )}

      {history.length > 0 && (
        <div className={s.historySection}>
          <h4 className={s.historyTitle}>Lending history</h4>
          <div className={s.historyList}>
            {history.map((r) => (
              <div key={r.id} className={s.historyItem}>
                <span className={s.historyBorrower}>{r.borrowerName}</span>
                <span className={s.historyDate}>
                  {new Date(r.lentDate).toLocaleDateString()} &rarr;{' '}
                  {r.returnedDate ? new Date(r.returnedDate).toLocaleDateString() : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LendingPanel;
