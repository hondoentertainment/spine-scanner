import React, { useEffect, useRef, useState } from 'react';
import { Check, Pencil, Search, X } from 'lucide-react';
import { searchShelfMatches } from '../shelf/shelfLookup.ts';
import type { ShelfMetadataHit, ShelfReviewItem } from '../shelf/types.ts';
import s from './ShelfScanReview.module.css';

interface ShelfScanReviewProps {
  items: ShelfReviewItem[];
  onChange: (items: ShelfReviewItem[]) => void;
  onConfirm: (items: ShelfReviewItem[]) => void;
  onCancel: () => void;
  /** Alternate matches when a spine was paired with the wrong book. */
  searchMatches?: (query: string) => Promise<ShelfMetadataHit[]>;
}

function confidenceHint(item: ShelfReviewItem): string {
  if (item.confidence >= 0.85 && !item.needsReview) return 'Looks right';
  if (item.confidence >= 0.6) return 'Check this match';
  if (item.reviewReason) return item.reviewReason;
  return 'Low confidence. Confirm or skip.';
}

const ShelfScanReview: React.FC<ShelfScanReviewProps> = ({
  items,
  onChange,
  onConfirm,
  onCancel,
  searchMatches = searchShelfMatches,
}) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [matches, setMatches] = useState<ShelfMetadataHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState('');
  const kept = items.filter((item) => item.decision === 'accept').length;
  const skipped = items.length - kept;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const update = (id: string, patch: Partial<ShelfReviewItem>) => {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const toggleEdit = (id: string) => {
    setEditingId((current) => (current === id ? null : id));
    setMatches([]);
    setSearchNote('');
  };

  const findMatch = async (item: ShelfReviewItem) => {
    const query = `${item.title} ${item.author}`.replace(/\s+/g, ' ').trim();
    setSearching(true);
    setSearchNote('');
    setMatches([]);
    try {
      const found = await searchMatches(query);
      setMatches(found);
      setSearchNote(found.length === 0 ? 'No other match. Edit the title, then search again.' : '');
    } catch {
      setSearchNote('Could not search right now. You can still edit the title and author.');
    } finally {
      setSearching(false);
    }
  };

  const applyMatch = (item: ShelfReviewItem, hit: ShelfMetadataHit) => {
    update(item.id, {
      title: hit.title,
      author: hit.author,
      isbn: hit.isbn,
      pageCount: hit.pageCount,
      coverImg: hit.thumbnail || item.coverImg,
      metadataSource: hit.source,
      confidence: 0.92,
      decision: 'accept',
      needsReview: false,
      reviewReason: '',
    });
    setMatches([]);
    setSearchNote('Match updated.');
  };

  return (
    <section className={s.panel} aria-labelledby="shelf-review-heading">
      <div className={s.header}>
        <h2 id="shelf-review-heading" ref={headingRef} tabIndex={-1} className={s.title}>
          Check these books
        </h2>
        <p className={s.lead}>
          {items.length === 1 ? '1 book' : `${items.length} books`} from this photo.
          Keep the ones you want. Nothing is saved until you add them.
        </p>
        <p className={s.tally} role="status">
          {kept} kept · {skipped} skipped
        </p>
      </div>

      <ul className={s.list} data-testid="shelf-review-list">
        {items.map((item) => {
          const skippedRow = item.decision === 'reject';
          const editing = editingId === item.id;
          const cover = item.coverImg || item.previewUrl;
          const inputId = `shelf-${item.id}`;
          return (
            <li
              key={item.id}
              className={`${s.card} ${skippedRow ? s.cardSkipped : ''}`}
              data-testid={`shelf-review-${item.id}`}
            >
              <div className={s.row}>
                {cover ? (
                  <img className={s.cover} alt="" src={cover} />
                ) : (
                  <span className={s.coverFallback} aria-hidden="true">
                    {(item.title || '?').slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className={s.copy}>
                  <h3 className={s.bookTitle}>{item.title || 'Untitled'}</h3>
                  <p className={s.author}>{item.author || 'Unknown author'}</p>
                  <p className={s.hint}>{confidenceHint(item)}</p>
                </div>
              </div>

              <div className={s.choices} role="group" aria-label={`Actions for ${item.title || 'this book'}`}>
                <button
                  type="button"
                  className={`${s.choice} ${item.decision === 'accept' ? s.choiceOn : ''}`}
                  aria-pressed={item.decision === 'accept'}
                  aria-label={`Keep ${item.title}`}
                  onClick={() => update(item.id, { decision: 'accept' })}
                >
                  <Check size={18} aria-hidden />
                  Keep
                </button>
                <button
                  type="button"
                  className={`${s.choice} ${editing ? s.choiceOn : ''}`}
                  aria-expanded={editing}
                  aria-label={`Edit ${item.title}`}
                  onClick={() => toggleEdit(item.id)}
                >
                  <Pencil size={18} aria-hidden />
                  Edit
                </button>
                <button
                  type="button"
                  className={`${s.choice} ${skippedRow ? s.choiceSkipOn : ''}`}
                  aria-pressed={skippedRow}
                  aria-label={`Skip ${item.title}`}
                  onClick={() => {
                    update(item.id, { decision: 'reject' });
                    if (editingId === item.id) toggleEdit(item.id);
                  }}
                >
                  <X size={18} aria-hidden />
                  Skip
                </button>
              </div>

              {editing && (
                <div className={s.editor}>
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
                  <button
                    type="button"
                    className={s.searchBtn}
                    onClick={() => { void findMatch(item); }}
                    disabled={searching || item.title.trim().length < 2}
                  >
                    <Search size={18} aria-hidden />
                    {searching ? 'Looking…' : 'Find a different match'}
                  </button>
                  {searchNote ? <p className={s.note} role="status">{searchNote}</p> : null}
                  {matches.length > 0 && (
                    <ul className={s.matchList} aria-label={`Other matches for ${item.title}`}>
                      {matches.map((hit) => (
                        <li key={`${hit.source}-${hit.isbn || hit.title}`}>
                          <button
                            type="button"
                            className={s.matchBtn}
                            aria-label={`Use ${hit.title} by ${hit.author}`}
                            onClick={() => applyMatch(item, hit)}
                          >
                            <span className={s.matchTitle}>{hit.title}</span>
                            <span className={s.matchAuthor}>{hit.author}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
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
          disabled={kept === 0}
          aria-label={kept === 1 ? 'Add all kept, 1 book' : `Add all kept, ${kept} books`}
          onClick={() => onConfirm(items)}
        >
          <Check size={18} aria-hidden />
          Add all kept
        </button>
      </div>
    </section>
  );
};

export default ShelfScanReview;
