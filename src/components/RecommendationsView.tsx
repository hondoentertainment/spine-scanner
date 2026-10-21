import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookmarkPlus, RefreshCw, ScanLine, Sparkles } from 'lucide-react';
import { useBookStore } from '../store/useBookStore.ts';
import { useToast } from './Toast.tsx';
import { getBookCoverSrc } from '../utils/bookPresentation.ts';
import { loadRecommendations, peekRecommendations } from '../recommendations/engine.ts';
import { isAlreadyInLibrary, matchesReaderLanguage } from '../recommendations/rank.ts';
import { toWishlistBook } from '../recommendations/wishlist.ts';
import type { BookRecommendation, RecommendationResult } from '../recommendations/types.ts';
import s from './RecommendationsView.module.css';

const sourceLabel: Record<BookRecommendation['source'], string> = {
  google_books: 'Google Books',
  open_library: 'Open Library',
  llm: 'Suggestions',
};

export default function RecommendationsView() {
  const navigate = useNavigate();
  const books = useBookStore((state) => state.books);
  const addBook = useBookStore((state) => state.addBook);
  const removeBook = useBookStore((state) => state.removeBook);
  const { toast } = useToast();
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (books.length === 0) {
      setResult({ recommendations: [], origin: 'empty', notice: '' });
      setLoading(false);
      return;
    }
    const cached = peekRecommendations(books);
    if (cached) setResult(cached);
    setLoading(!cached);
    // Suggestions load after this view is open. The library list does not wait on them.
    void loadRecommendations(books, { force: refreshToken > 0 }).then((next) => {
      if (cancelled) return;
      setResult(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [books, refreshToken]);

  const visible = (result?.recommendations ?? []).filter((recommendation) => (
    matchesReaderLanguage(recommendation.language) && !isAlreadyInLibrary(recommendation, books)
  ));

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
          From your shelves
        </span>
        <h1 className={s.title}>Suggestions</h1>
        <p className={s.lede}>
          Books you don&apos;t own yet. Each one names the books already on your shelves that suggested it.
        </p>
        <div className={s.heroActions}>
          <button type="button" className={`glass ${s.secondary}`} onClick={() => navigate('/library')}>
            Back to library
          </button>
          <button
            type="button"
            className={`glass ${s.secondary}`}
            onClick={() => setRefreshToken((value) => value + 1)}
            disabled={loading || books.length === 0}
          >
            <RefreshCw size={18} aria-hidden />
            Refresh suggestions
          </button>
        </div>
      </header>

      <p className={s.live} role="status" aria-live="polite">{announcement}</p>

      {result?.notice && (
        <p className={`glass ${s.notice}`} role="status">{result.notice}</p>
      )}

      {loading && visible.length === 0 && (
        <div className={s.loading} role="status">
          <span className={s.skeleton} />
          <span className={s.skeleton} />
          <p>Looking through your shelves…</p>
        </div>
      )}

      {!loading && books.length === 0 && (
        <div className={`glass ${s.empty}`}>
          <p>Add a few books first. Suggestions are based on the titles you already own.</p>
          <button type="button" className={s.primary} onClick={() => navigate('/scan')}>
            <ScanLine size={18} aria-hidden />
            Add books
          </button>
        </div>
      )}

      {!loading && books.length > 0 && visible.length === 0 && (
        <div className={`glass ${s.empty}`}>
          <p>
            {result?.notice
              ? 'Saved suggestions are hidden once they are already on your shelf.'
              : 'Nothing new to suggest from this shelf yet. Refresh after you add a few more books.'}
          </p>
        </div>
      )}

      {visible.length > 0 && (
        <ul className={s.list} aria-label="Suggested books">
          {visible.map((recommendation) => (
            <li key={recommendation.id} className={`glass ${s.card}`}>
              <img
                src={getBookCoverSrc(recommendation.coverImg)}
                alt=""
                className={s.cover}
                loading="lazy"
                decoding="async"
              />
              <div className={s.body}>
                <p className={s.reason}>{recommendation.reason}</p>
                <h2 className={s.bookTitle}>{recommendation.title}</h2>
                <p className={s.author}>{recommendation.author}</p>
                <p className={s.source}>{sourceLabel[recommendation.source]}</p>
              </div>
              <div className={s.actions}>
                <button
                  type="button"
                  className={s.primary}
                  onClick={() => addToWishlist(recommendation)}
                  aria-label={`Add to wishlist: ${recommendation.title}`}
                >
                  <BookmarkPlus size={18} aria-hidden />
                  Add to wishlist
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {loading && visible.length > 0 && (
        <p className={s.updating} role="status">Updating suggestions…</p>
      )}
    </div>
  );
}
