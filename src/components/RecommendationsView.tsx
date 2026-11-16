import { useEffect, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookmarkPlus, RefreshCw, ScanLine, Sparkles } from 'lucide-react';
import { useBookStore } from '../store/useBookStore.ts';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';
import { getBookCoverSrc } from '../utils/bookPresentation.ts';
import { loadRecommendations, peekRecommendations } from '../recommendations/engine.ts';
import { countsTowardShelf, isAlreadyInLibrary, matchesReaderLanguage } from '../recommendations/rank.ts';
import { toWishlistBook } from '../recommendations/wishlist.ts';
import type { BookRecommendation, RecommendationResult } from '../recommendations/types.ts';
import { useToast } from './Toast.tsx';
import s from './RecommendationsView.module.css';

const sourceLabel: Record<BookRecommendation['source'], string> = {
  google_books: 'Google Books',
  open_library: 'Open Library',
  llm: 'Suggestions',
};

type SuggestionState = 'offline' | 'error' | 'empty' | 'nothing-new' | 'already-owned';

/**
 * Arrow keys move between recommendation actions, the same way the shelf map
 * moves between rooms and shelves. Tab still visits every control.
 */
function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
  const key = event.key;
  const delta = key === 'ArrowDown' || key === 'ArrowRight' ? 1
    : key === 'ArrowUp' || key === 'ArrowLeft' ? -1
    : null;
  const jump = key === 'Home' ? 0 : key === 'End' ? -1 : null;
  if (delta == null && jump == null) return;

  const target = event.target;
  if (!(target instanceof Element)) return;
  const current = target.closest<HTMLButtonElement>('[data-rec-action]');
  if (!current || !event.currentTarget.contains(current)) return;

  const actions = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-rec-action]')];
  const index = actions.indexOf(current);
  if (index < 0) return;

  const nextIndex = jump === 0
    ? 0
    : jump === -1
      ? actions.length - 1
      : Math.min(actions.length - 1, Math.max(0, index + (delta ?? 0)));

  event.preventDefault();
  actions[nextIndex]?.focus();
}

export default function RecommendationsView() {
  const navigate = useNavigate();
  const { online } = useOnlineStatus();
  const books = useBookStore((state) => state.books);
  const shelves = useBookStore((state) => state.shelves);
  const addBook = useBookStore((state) => state.addBook);
  const removeBook = useBookStore((state) => state.removeBook);
  const { toast } = useToast();
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const shelfBooks = books.filter(countsTowardShelf);

  useEffect(() => {
    let cancelled = false;
    if (shelfBooks.length === 0) {
      setResult({ recommendations: [], origin: 'empty', notice: '' });
      setLoading(false);
      return;
    }
    const cached = peekRecommendations(books, Date.now(), shelves);
    if (cached) setResult(cached);
    setLoading(!cached);
    // Recommendations load after this view is open. The library list does not wait on them.
    void loadRecommendations(books, { force: refreshToken > 0, online, shelves }).then((next) => {
      if (cancelled) return;
      setResult(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [books, shelves, shelfBooks.length, refreshToken, online]);

  const visible = (result?.recommendations ?? []).filter((recommendation) => (
    matchesReaderLanguage(recommendation.language) && !isAlreadyInLibrary(recommendation, books)
  ));

  const retry = () => setRefreshToken((value) => value + 1);

  const suggestionState: SuggestionState | null = loading && visible.length === 0
    ? null
    : visible.length > 0
      ? null
      : shelfBooks.length === 0
        ? 'empty'
        : result?.origin === 'offline'
          ? 'offline'
          : result?.origin === 'error'
            ? 'error'
            : (result?.recommendations.length ?? 0) > 0
              ? 'already-owned'
              : 'nothing-new';

  const addToWishlist = (recommendation: BookRecommendation) => {
    if (isAlreadyInLibrary(recommendation, books)) return;
    const added = toWishlistBook(recommendation);
    addBook(added);
    setAnnouncement(`Added ${recommendation.title} to your wishlist.`);
    toast(`Added ${recommendation.title} to your wishlist`, 'success', 6000, undefined, {
      label: 'Undo',
      onClick: () => {
        removeBook(added.id);
        setAnnouncement(`Removed ${recommendation.title} from your wishlist.`);
      },
    });
  };

  return (
    <div className={s.wrap}>
      <header className={`glass ${s.hero}`}>
        <span className={s.eyebrow}>
          <Sparkles size={14} aria-hidden />
          For your shelves
        </span>
        <h1 className={s.title}>Recommended for your shelves</h1>
        <p className={s.lede}>
          Books you don&apos;t own yet. Each one explains itself from the authors, shelves, and loans already in your library.
        </p>
        <div className={s.heroActions}>
          <button type="button" className={`glass ${s.secondary}`} onClick={() => navigate('/library')}>
            Back to library
          </button>
          <button
            type="button"
            className={`glass ${s.secondary}`}
            onClick={() => setRefreshToken((value) => value + 1)}
            disabled={loading || shelfBooks.length === 0}
          >
            <RefreshCw size={18} aria-hidden />
            Refresh recommendations
          </button>
        </div>
      </header>

      <p className={s.live} role="status" aria-live="polite">{announcement}</p>

      {result?.notice && !suggestionState && (
        <p className={`glass ${s.notice}`} role="status">{result.notice}</p>
      )}

      {loading && visible.length === 0 && (
        <div className={s.loading} role="status">
          <span className={s.skeleton} />
          <span className={s.skeleton} />
          <p>Looking through your shelves…</p>
        </div>
      )}

      {suggestionState === 'empty' && (
        <div className={`glass ${s.empty}`} data-testid="recommendations-state" data-state="empty">
          <h2 className={s.emptyTitle}>Nothing to suggest yet</h2>
          <p>Add a few books first. Recommendations come from the titles, shelves, and loans you already have.</p>
          <button type="button" className={s.primary} onClick={() => navigate('/scan')}>
            <ScanLine size={18} aria-hidden />
            Add books
          </button>
        </div>
      )}

      {suggestionState === 'offline' && (
        <div className={`glass ${s.empty}`} data-testid="recommendations-state" data-state="offline">
          <h2 className={s.emptyTitle}>You&apos;re offline</h2>
          <p>Recommendations need a connection. Your library stays on this device.</p>
          <button type="button" className={s.primary} onClick={retry} disabled={loading}>
            <RefreshCw size={18} aria-hidden />
            Try again
          </button>
        </div>
      )}

      {suggestionState === 'error' && (
        <div className={`glass ${s.empty}`} data-testid="recommendations-state" data-state="error">
          <h2 className={s.emptyTitle}>Couldn&apos;t load suggestions</h2>
          <p>Something went wrong. Your library is unchanged.</p>
          <button type="button" className={s.primary} onClick={retry} disabled={loading}>
            <RefreshCw size={18} aria-hidden />
            Try again
          </button>
        </div>
      )}

      {suggestionState === 'nothing-new' && (
        <div className={`glass ${s.empty}`} data-testid="recommendations-state" data-state="nothing-new">
          <h2 className={s.emptyTitle}>Nothing new yet</h2>
          <p>Nothing new to suggest from this shelf yet. Add a few more books or name a shelf, then try again.</p>
          <button type="button" className={s.primary} onClick={() => navigate('/scan')}>
            <ScanLine size={18} aria-hidden />
            Add a book
          </button>
        </div>
      )}

      {suggestionState === 'already-owned' && (
        <div className={`glass ${s.empty}`} data-testid="recommendations-state" data-state="already-owned">
          <h2 className={s.emptyTitle}>Already on your shelf</h2>
          <p>Saved suggestions are hidden once they are already on your shelf.</p>
          <button type="button" className={s.primary} onClick={() => navigate('/library')}>
            Back to library
          </button>
        </div>
      )}

      {visible.length > 0 && shelfBooks.length < 3 && (
        <p className={`glass ${s.notice}`} data-testid="recommendations-small-shelf">
          Your shelf is still small. Add a few more books, or group them on a shelf, and these picks get more specific.
        </p>
      )}

      {visible.length > 0 && (
        <ul
          className={s.list}
          aria-label="Recommended for your shelves"
          aria-keyshortcuts="ArrowUp ArrowDown Home End"
          onKeyDown={onListKeyDown}
        >
          {visible.map((recommendation, index) => {
            const reasonId = `rec-reason-${index}`;
            const titleId = `rec-title-${index}`;
            return (
              <li key={recommendation.id} className={`glass ${s.card}`}>
                <article className={s.book} aria-labelledby={titleId} aria-describedby={reasonId}>
                  <img
                    src={getBookCoverSrc(recommendation.coverImg)}
                    alt=""
                    className={s.cover}
                    loading="lazy"
                    decoding="async"
                  />
                  <div className={s.body}>
                    <p id={reasonId} className={s.reason}>{recommendation.reason}</p>
                    <h2 id={titleId} className={s.bookTitle}>{recommendation.title}</h2>
                    <p className={s.author}>{recommendation.author}</p>
                    <p className={s.source}>{sourceLabel[recommendation.source]}</p>
                  </div>
                  <div className={s.actions}>
                    <button
                      type="button"
                      className={s.primary}
                      data-rec-action=""
                      onClick={() => addToWishlist(recommendation)}
                      aria-describedby={reasonId}
                      aria-label={`Add to wishlist: ${recommendation.title}`}
                    >
                      <BookmarkPlus size={18} aria-hidden />
                      Add to wishlist
                    </button>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {loading && visible.length > 0 && (
        <p className={s.updating} role="status">Updating suggestions…</p>
      )}
    </div>
  );
}
