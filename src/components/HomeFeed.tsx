import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Library, ScanLine, Sparkles, Clock } from 'lucide-react';
import { useBookStore } from '../store/useBookStore.ts';
import { getBookCoverSrc, getLibraryInsights } from '../utils/bookPresentation.ts';
import type { BookEntry } from '../types.ts';
import s from './HomeFeed.module.css';

const statusLabel: Record<BookEntry['status'], string> = {
  'to-read': 'Want to read',
  reading: 'Reading',
  read: 'Finished',
  dnf: 'DNF',
};

function formatAdded(dateIso: string): string {
  const d = new Date(dateIso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function HomeFeed() {
  const navigate = useNavigate();
  const books = useBookStore((state) => state.books);
  const insights = useMemo(() => getLibraryInsights(books), [books]);

  const sortedRecent = useMemo(
    () => [...books].sort((a, b) => b.dateAdded.localeCompare(a.dateAdded)),
    [books],
  );

  const feedItems = useMemo(() => {
    const reading = books.filter((b) => b.status === 'reading');
    const rest = sortedRecent.filter((b) => !reading.some((r) => r.id === b.id));
    return [...reading, ...rest];
  }, [books, sortedRecent]);

  const strip = sortedRecent.slice(0, 12);

  return (
    <div className={s.wrap}>
      <header className={`glass ${s.hero}`}>
        <span className={s.eyebrow}>
          <Sparkles size={14} aria-hidden />
          Your shelf
        </span>
        <h1 className={s.title}>Home</h1>
        <p className={s.lede}>
          A calm feed of what you are reading and what you added recently — like a stories row, with your real library behind it.
        </p>
        <div className={s.heroActions}>
          <button type="button" className={`glass ${s.primary}`} onClick={() => navigate('/scan')}>
            <ScanLine size={18} aria-hidden />
            Add books
          </button>
          <button type="button" className={`glass ${s.secondary}`} onClick={() => navigate('/library')}>
            <Library size={18} aria-hidden />
            Open library
          </button>
        </div>
      </header>

      <section className={`glass ${s.stats}`} aria-label="Library snapshot">
        <div className={s.stat}>
          <span className={s.statValue}>{insights.totalBooks}</span>
          <span className={s.statLabel}>Books</span>
        </div>
        <div className={s.stat}>
          <span className={s.statValue}>{insights.readingCount}</span>
          <span className={s.statLabel}>Reading</span>
        </div>
        <div className={s.stat}>
          <span className={s.statValue}>{insights.completionRate}%</span>
          <span className={s.statLabel}>Done</span>
        </div>
      </section>

      {strip.length > 0 && (
        <section className={s.storiesSection} aria-label="Recently added">
          <div className={s.sectionHead}>
            <Clock size={16} aria-hidden />
            <h2 className={s.sectionTitle}>Recently added</h2>
          </div>
          <div className={s.storiesRow} role="list">
            {strip.map((book) => (
              <button
                key={book.id}
                type="button"
                className={s.storyRing}
                onClick={() => navigate(`/library?isbn=${encodeURIComponent(book.isbn)}`)}
                aria-label={`Open ${book.title}`}
              >
                <span className={s.storyImgWrap}>
                  <img
                    src={getBookCoverSrc(book.coverImg)}
                    alt=""
                    className={s.storyImg}
                    loading="lazy"
                    decoding="async"
                  />
                </span>
                <span className={s.storyCaption}>{book.title}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className={s.feedSection} aria-label="Activity">
        <div className={s.sectionHead}>
          <BookOpen size={16} aria-hidden />
          <h2 className={s.sectionTitle}>For you</h2>
        </div>
        {feedItems.length === 0 ? (
          <div className={`glass ${s.empty}`}>
            <p>No books yet. Scan your first spine and it will show up here.</p>
            <button type="button" className={`glass ${s.primary}`} onClick={() => navigate('/scan')}>
              <ScanLine size={18} aria-hidden />
              Start scanning
            </button>
          </div>
        ) : (
          <ul className={s.feedList}>
            {feedItems.map((book) => (
              <li key={book.id}>
                <button
                  type="button"
                  className={`glass ${s.feedCard}`}
                  onClick={() => navigate(`/library?isbn=${encodeURIComponent(book.isbn)}`)}
                >
                  <img
                    src={getBookCoverSrc(book.coverImg)}
                    alt=""
                    className={s.feedCover}
                    loading="lazy"
                    decoding="async"
                  />
                  <div className={s.feedBody}>
                    <span className={`${s.badge} ${s[`badge_${book.status.replace('-', '_')}`]}`}>
                      {statusLabel[book.status]}
                    </span>
                    <h3 className={s.feedTitle}>{book.title}</h3>
                    <p className={s.feedAuthor}>{book.author}</p>
                    <p className={s.feedMeta}>Added {formatAdded(book.dateAdded)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
