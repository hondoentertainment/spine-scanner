import React, { useEffect, useRef } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { METADATA_SOURCE_LABEL } from '../types.ts';
import type { ShelfReviewItem } from '../shelf/types.ts';
import s from './ShelfScanReview.module.css';

interface ShelfScanReviewProps {
  items: ShelfReviewItem[];
  onChange: (items: ShelfReviewItem[]) => void;
  onConfirm: (items: ShelfReviewItem[]) => void;
  onCancel: () => void;
}

const METHOD_LABEL: Record<ShelfReviewItem['detectionMethod'], string> = {
  barcode: 'Barcode',
  ocr: 'On-device OCR',
  'text-search': 'Title search',
  vision: 'Vision service',
};

const ShelfScanReview: React.FC<ShelfScanReviewProps> = ({ items, onChange, onConfirm, onCancel }) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const selected = items.filter((item) => item.decision === 'accept').length;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const update = (id: string, patch: Partial<ShelfReviewItem>) => {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  return (
    <section className={s.panel} aria-labelledby="shelf-review-heading">
      <div className={s.header}>
        <h2 id="shelf-review-heading" ref={headingRef} tabIndex={-1} className={s.title}>
          Review shelf scan
        </h2>
        <p className={s.lead}>
          {items.length === 1 ? '1 book detected.' : `${items.length} books detected.`}
          {' '}Checked books are added. Edit anything that looks wrong, or reject a spine you do not want.
          Nothing is saved until you confirm.
        </p>
      </div>

      <ul className={s.list} data-testid="shelf-review-list">
        {items.map((item, index) => {
          const rejected = item.decision === 'reject';
          const inputId = `shelf-${item.id}`;
          return (
            <li key={item.id} className={`${s.card} ${rejected ? s.cardRejected : ''}`}>
              <div className={s.cardTop}>
                <label className={s.acceptLabel}>
                  <input
                    type="checkbox"
                    checked={!rejected}
                    onChange={(event) => update(item.id, { decision: event.target.checked ? 'accept' : 'reject' })}
                    aria-label={`Include ${item.title}`}
                  />
                  <span>Book {index + 1}</span>
                </label>
                <span className={s.meta}>
                  {METHOD_LABEL[item.detectionMethod]}
                  {item.metadataSource !== 'manual' ? ` · ${METADATA_SOURCE_LABEL[item.metadataSource]}` : ''}
                  {' · '}
                  {Math.round(item.confidence * 100)}%
                </span>
                {rejected ? (
                  <button type="button" className={s.textBtn} onClick={() => update(item.id, { decision: 'accept' })}>
                    <RotateCcw size={14} /> Undo
                  </button>
                ) : (
                  <button type="button" className={s.textBtn} onClick={() => update(item.id, { decision: 'reject' })}>
                    <X size={14} /> Reject
                  </button>
                )}
              </div>

              {item.previewUrl || item.coverImg ? (
                <img
                  className={s.preview}
                  alt=""
                  src={item.coverImg || item.previewUrl}
                />
              ) : null}

              <div className={s.fields}>
                <label htmlFor={`${inputId}-title`}>Title</label>
                <input
                  id={`${inputId}-title`}
                  value={item.title}
                  onChange={(event) => update(item.id, { title: event.target.value })}
                />
                <label htmlFor={`${inputId}-author`}>Author</label>
                <input
                  id={`${inputId}-author`}
                  value={item.author}
                  onChange={(event) => update(item.id, { author: event.target.value })}
                />
                <label htmlFor={`${inputId}-isbn`}>ISBN</label>
                <input
                  id={`${inputId}-isbn`}
                  value={item.isbn}
                  inputMode="text"
                  spellCheck={false}
                  onChange={(event) => update(item.id, { isbn: event.target.value })}
                />
              </div>
              {item.reviewReason ? <p className={s.reason}>{item.reviewReason}</p> : null}
            </li>
          );
        })}
      </ul>

      <div className={s.actions}>
        <button type="button" className={s.secondary} onClick={onCancel}>
          Scan another photo
        </button>
        <button
          type="button"
          className={s.primary}
          data-testid="shelf-import-btn"
          disabled={selected === 0}
          onClick={() => onConfirm(items)}
        >
          <Check size={18} />
          {selected === 1 ? 'Add 1 book' : `Add ${selected} books`}
        </button>
      </div>
    </section>
  );
};

export default ShelfScanReview;
