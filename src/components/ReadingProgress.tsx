import React from 'react';
import { BookOpen, CheckCircle, Star, Calendar } from 'lucide-react';
import type { BookEntry } from '../types.ts';
import styles from './ReadingProgress.module.css';

interface ReadingProgressProps {
  book: BookEntry;
  onUpdate: (updates: Partial<BookEntry>) => void;
}

const ReadingProgress: React.FC<ReadingProgressProps> = ({ book, onUpdate }) => {
  const pageCount = book.pageCount || 0;
  const pagesRead = book.pagesRead ?? 0;
  const percent = book.progressPercent ?? (pageCount > 0 ? Math.round((pagesRead / pageCount) * 100) : 0);

  const handlePagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Math.max(0, Math.min(parseInt(e.target.value) || 0, pageCount || 99999));
    const newPercent = pageCount > 0 ? Math.round((val / pageCount) * 100) : 0;
    onUpdate({ pagesRead: val, progressPercent: newPercent });
  };

  const handleStartReading = () => {
    onUpdate({
      status: 'reading',
      startedReading: new Date().toISOString(),
    });
  };

  const handleFinish = () => {
    onUpdate({
      status: 'read',
      finishedReading: new Date().toISOString(),
      progressPercent: 100,
      pagesRead: pageCount > 0 ? pageCount : pagesRead,
    });
  };

  const handleRating = (rating: number) => {
    onUpdate({ rating: book.rating === rating ? undefined : rating });
  };

  return (
    <div className={styles.container} data-testid="reading-progress">
      {/* Progress bar */}
      <div className={styles.progressRow}>
        <div className={styles.progressBarTrack}>
          <div
            className={styles.progressBarFill}
            style={{ width: `${Math.min(percent, 100)}%` }}
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <span className={styles.progressLabel}>{percent}%</span>
      </div>

      {/* Pages read input */}
      {pageCount > 0 && (
        <div className={styles.pagesRow}>
          <input
            type="number"
            className={styles.pagesInput}
            value={pagesRead || ''}
            onChange={handlePagesChange}
            min={0}
            max={pageCount}
            aria-label="Pages read"
            placeholder="0"
          />
          <span className={styles.pagesText}>/ {pageCount} pp</span>
        </div>
      )}

      {/* Action buttons */}
      <div className={styles.actionRow}>
        {book.status !== 'reading' && book.status !== 'read' && (
          <button
            type="button"
            className={styles.startBtn}
            onClick={handleStartReading}
            aria-label="Start Reading"
          >
            <BookOpen size={14} /> Start Reading
          </button>
        )}
        {book.status !== 'read' && (
          <button
            type="button"
            className={styles.finishBtn}
            onClick={handleFinish}
            aria-label="Finish"
          >
            <CheckCircle size={14} /> Finish
          </button>
        )}
      </div>

      {/* Star rating */}
      <div className={styles.ratingRow}>
        <span className={styles.ratingLabel}>Rating</span>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className={`${styles.star} ${book.rating != null && star <= book.rating ? styles.starFilled : ''}`}
            onClick={() => handleRating(star)}
            aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
          >
            <Star size={18} fill={book.rating != null && star <= book.rating ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>

      {/* Dates */}
      {(book.startedReading || book.finishedReading) && (
        <div className={styles.datesRow}>
          {book.startedReading && (
            <span className={styles.dateItem}>
              <Calendar size={12} />
              Started: <span className={styles.dateValue}>{new Date(book.startedReading).toLocaleDateString()}</span>
            </span>
          )}
          {book.finishedReading && (
            <span className={styles.dateItem}>
              <Calendar size={12} />
              Finished: <span className={styles.dateValue}>{new Date(book.finishedReading).toLocaleDateString()}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default ReadingProgress;
