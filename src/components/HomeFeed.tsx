import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Library, ScanLine, Sparkles, Clock, Target, Cloud, Inbox, Lightbulb, BarChart3 } from 'lucide-react';
import { useBookStore } from '../store/useBookStore.ts';
import { useProfileStore } from '../store/useProfileStore.ts';
import { useAuthStore } from '../store/useAuthStore.ts';
import { useSyncQueue } from '../store/useSyncQueue.ts';
import { getBookCoverSrc, getLibraryInsights } from '../utils/bookPresentation.ts';
import { formatRelativeTime } from '../utils/formatRelativeTime.ts';
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
  const { preferences } = useProfileStore();
  const user = useAuthStore((state) => state.user);
  const pendingChanges = useSyncQueue((state) => state.pendingChanges);
  const lastSyncedAt = useSyncQueue((state) => state.lastSyncedAt);
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

  const bookGoal = preferences.readingGoalBooksPerYear;
  const pageGoal = preferences.readingGoalPagesPerYear;
  const showBookGoal = bookGoal != null && bookGoal > 0;
  const showPageGoal = pageGoal != null && pageGoal > 0;
  const bookGoalTarget = showBookGoal ? bookGoal : 0;
  const pageGoalTarget = showPageGoal ? pageGoal : 0;
  const bookGoalPct = showBookGoal ? Math.min(100, Math.round((insights.finishedThisYear / bookGoalTarget) * 100)) : 0;
  const pageGoalPct = showPageGoal ? Math.min(100, Math.round((insights.pagesReadThisYear / pageGoalTarget) * 100)) : 0;

  const yearStats = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const finishedThisYear = books.filter(
      (b) =>
        b.status === 'read' &&
        b.finishedAt &&
        new Date(b.finishedAt).getFullYear() === currentYear,
    );
    const booksRead = finishedThisYear.length;
    const totalPages = finishedThisYear.reduce((sum, b) => sum + (b.pageCount || 0), 0);
    const avgPages = booksRead > 0 ? Math.round(totalPages / booksRead) : 0;

    let busiestMonthLabel = '';
    if (booksRead > 0) {
      const counts = new Array<number>(12).fill(0);
      finishedThisYear.forEach((b) => {
        const m = new Date(b.finishedAt as string).getMonth();
        counts[m] += 1;
      });
      let bestMonth = 0;
      let bestCount = 0;
      counts.forEach((c, i) => {
        if (c > bestCount) {
          bestCount = c;
          bestMonth = i;
        }
      });
      const monthName = new Date(currentYear, bestMonth, 1).toLocaleString(undefined, { month: 'long' });
      busiestMonthLabel = `${monthName} (${bestCount} book${bestCount === 1 ? '' : 's'})`;
    }

    return { currentYear, booksRead, totalPages, avgPages, busiestMonthLabel };
  }, [books]);

  const suggestions = useMemo(() => {
    const out: { book: BookEntry; reason: string }[] = [];
    const reading = books.filter((b) => b.status === 'reading');
    reading
      .sort((a, b) => b.dateAdded.localeCompare(a.dateAdded))
      .slice(0, 2)
      .forEach((b) => out.push({ book: b, reason: 'Continue reading' }));
    books
      .filter((b) => b.status === 'to-read')
      .sort((a, b) => b.dateAdded.localeCompare(a.dateAdded))
      .slice(0, 3)
      .forEach((b) => out.push({ book: b, reason: 'From your want-to-read list' }));
    const seen = new Set<string>();
    return out.filter((item) => {
      if (seen.has(item.book.id)) return false;
      seen.add(item.book.id);
      return true;
    }).slice(0, 5);
  }, [books]);

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

      {user && (pendingChanges > 0 || lastSyncedAt) && (
        <div className={`glass ${s.syncStrip}`} aria-live="polite">
          <Cloud size={16} className={s.syncIcon} aria-hidden />
          <span>
            {pendingChanges > 0
              ? `${pendingChanges} local change${pendingChanges === 1 ? '' : 's'} waiting to sync`
              : lastSyncedAt
                ? `Last synced ${formatRelativeTime(lastSyncedAt)}`
                : 'Cloud sync ready'}
          </span>
        </div>
      )}

      {(showBookGoal || showPageGoal) && (
        <section className={`glass ${s.goals}`} aria-label="Reading goals this year">
          <div className={s.sectionHead}>
            <Target size={16} aria-hidden />
            <h2 className={s.sectionTitle}>{new Date().getFullYear()} goals</h2>
          </div>
          {showBookGoal && (
            <div className={s.goalRow}>
              <div className={s.goalMeta}>
                <span>Books finished</span>
                <span>
                  {insights.finishedThisYear} / {bookGoalTarget}
                </span>
              </div>
              <div className={s.goalTrack} role="progressbar" aria-valuenow={bookGoalPct} aria-valuemin={0} aria-valuemax={100}>
                <span className={s.goalFill} style={{ width: `${bookGoalPct}%` }} />
              </div>
            </div>
          )}
          {showPageGoal && (
            <div className={s.goalRow}>
              <div className={s.goalMeta}>
                <span>Pages finished</span>
                <span>
                  {insights.pagesReadThisYear.toLocaleString()} / {pageGoalTarget.toLocaleString()}
                </span>
              </div>
              <div className={s.goalTrack} role="progressbar" aria-valuenow={pageGoalPct} aria-valuemin={0} aria-valuemax={100}>
                <span className={s.goalFill} style={{ width: `${pageGoalPct}%` }} />
              </div>
            </div>
          )}
          <button type="button" className={s.goalLink} onClick={() => navigate('/profile')}>
            Adjust goals in profile
          </button>
        </section>
      )}

      {yearStats.booksRead > 0 && (
        <section className={`glass ${s.yearStats}`} aria-label="Your reading year">
          <div className={s.sectionHead}>
            <BarChart3 size={16} aria-hidden />
            <h2 className={s.sectionTitle}>{yearStats.currentYear} in books</h2>
          </div>
          <div className={s.yearStatsGrid}>
            <div className={s.yearStatTile}>
              <span className={s.yearStatValue}>{yearStats.booksRead}</span>
              <span className={s.yearStatLabel}>books finished</span>
            </div>
            <div className={s.yearStatTile}>
              <span className={s.yearStatValue}>{yearStats.totalPages.toLocaleString()}</span>
              <span className={s.yearStatLabel}>pages read</span>
            </div>
            <div className={s.yearStatTile}>
              <span className={s.yearStatValue}>{yearStats.avgPages}</span>
              <span className={s.yearStatLabel}>avg pages/book</span>
            </div>
            {yearStats.booksRead >= 2 && (
              <div className={s.yearStatTile}>
                <span className={s.yearStatValue}>{yearStats.busiestMonthLabel}</span>
                <span className={s.yearStatLabel}>busiest month</span>
              </div>
            )}
          </div>
        </section>
      )}

      {insights.reviewCount > 0 && (
        <div className={`glass ${s.reviewBanner}`}>
          <Inbox size={18} aria-hidden />
          <div className={s.reviewBannerBody}>
            <strong>Review queue</strong>
            <span>
              {insights.reviewCount} book{insights.reviewCount === 1 ? '' : 's'} need a quick metadata check.
            </span>
          </div>
          <button type="button" className={s.reviewBannerBtn} onClick={() => navigate('/library?review=1')}>
            Open queue
          </button>
        </div>
      )}

      {suggestions.length > 0 && (
        <section className={s.suggestionsSection} aria-label="Suggestions">
          <div className={s.sectionHead}>
            <Lightbulb size={16} aria-hidden />
            <h2 className={s.sectionTitle}>Suggestions</h2>
          </div>
          <ul className={s.suggestionList}>
            {suggestions.map(({ book, reason }) => (
              <li key={book.id}>
                <button
                  type="button"
                  className={`glass ${s.suggestionCard}`}
                  onClick={() => navigate(`/library?isbn=${encodeURIComponent(book.isbn)}`)}
                >
                  <img src={getBookCoverSrc(book.coverImg)} alt="" className={s.suggestionCover} loading="lazy" decoding="async" />
                  <div>
                    <span className={s.suggestionReason}>{reason}</span>
                    <span className={s.suggestionTitle}>{book.title}</span>
                    <span className={s.suggestionAuthor}>{book.author}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

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
