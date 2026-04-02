import { useMemo } from 'react';
import { useBookStore } from '../store/useBookStore.ts';
import { useAuthStore } from '../store/useAuthStore.ts';
import { getLibraryInsights, getBookCoverSrc } from '../utils/bookPresentation.ts';
import {
  Scan,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Cloud,
  ArrowRight,
  BookMarked,
  Star,
  Clock,
  TrendingUp,
  Library,
} from 'lucide-react';
import styles from './NextSteps.module.css';

interface NextStepsProps {
  onNavigate: (view: 'scan' | 'library' | 'data' | 'profile') => void;
  onOpenBook: (isbn: string) => void;
}

interface Recommendation {
  id: string;
  priority: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  action: () => void;
  actionLabel: string;
  accent: string;
  books?: Array<{ isbn: string; title: string; author: string; coverImg: string }>;
}

export default function NextSteps({ onNavigate, onOpenBook }: NextStepsProps) {
  const { books } = useBookStore();
  const { user } = useAuthStore();
  const insights = useMemo(() => getLibraryInsights(books), [books]);

  const recommendations = useMemo(() => {
    const recs: Recommendation[] = [];

    // Empty library — scan your first book
    if (insights.totalBooks === 0) {
      recs.push({
        id: 'first-scan',
        priority: 1,
        icon: <Scan size={22} />,
        title: 'Scan your first book',
        description: 'Point your camera at a barcode, snap a photo, or type an ISBN to start building your library.',
        action: () => onNavigate('scan'),
        actionLabel: 'Start scanning',
        accent: 'var(--accent-blue)',
      });
      recs.push({
        id: 'import-existing',
        priority: 2,
        icon: <Upload size={22} />,
        title: 'Import an existing collection',
        description: 'Already tracking books on Goodreads, LibraryThing, or StoryGraph? Import them in one step.',
        action: () => onNavigate('data'),
        actionLabel: 'Import books',
        accent: 'var(--accent-purple)',
      });
      return recs;
    }

    // Books needing review
    const reviewBooks = books.filter((b) => b.needsReview);
    if (reviewBooks.length > 0) {
      recs.push({
        id: 'review-books',
        priority: 1,
        icon: <AlertTriangle size={22} />,
        title: `${reviewBooks.length} book${reviewBooks.length === 1 ? '' : 's'} need${reviewBooks.length === 1 ? 's' : ''} review`,
        description: 'These entries are missing metadata or have unverified ISBNs. Fill in the details so your library stays accurate.',
        action: () => onOpenBook(reviewBooks[0].isbn),
        actionLabel: 'Review now',
        accent: '#f59e0b',
        books: reviewBooks.slice(0, 3).map((b) => ({
          isbn: b.isbn,
          title: b.title,
          author: b.author,
          coverImg: b.coverImg,
        })),
      });
    }

    // Currently reading — continue
    const reading = books
      .filter((b) => b.status === 'reading')
      .sort((a, b) => Date.parse(b.lastProgressAt ?? b.dateAdded) - Date.parse(a.lastProgressAt ?? a.dateAdded));
    if (reading.length > 0) {
      recs.push({
        id: 'continue-reading',
        priority: 2,
        icon: <BookOpen size={22} />,
        title: 'Continue reading',
        description: reading.length === 1
          ? `You're in the middle of "${reading[0].title}". Update your progress to keep your stats accurate.`
          : `You have ${reading.length} books in progress. Pick one to update your reading progress.`,
        action: () => onOpenBook(reading[0].isbn),
        actionLabel: 'Update progress',
        accent: 'var(--accent-blue)',
        books: reading.slice(0, 3).map((b) => ({
          isbn: b.isbn,
          title: b.title,
          author: b.author,
          coverImg: b.coverImg,
        })),
      });
    }

    // To-read books — start something new
    const toRead = books
      .filter((b) => b.status === 'to-read' && !b.needsReview)
      .sort((a, b) => Date.parse(b.dateAdded) - Date.parse(a.dateAdded));
    if (toRead.length > 0 && insights.readingCount === 0) {
      recs.push({
        id: 'start-reading',
        priority: 3,
        icon: <BookMarked size={22} />,
        title: 'Pick your next read',
        description: `You have ${toRead.length} book${toRead.length === 1 ? '' : 's'} waiting. Mark one as "reading" to track your progress.`,
        action: () => onOpenBook(toRead[0].isbn),
        actionLabel: 'Choose a book',
        accent: '#22c55e',
        books: toRead.slice(0, 3).map((b) => ({
          isbn: b.isbn,
          title: b.title,
          author: b.author,
          coverImg: b.coverImg,
        })),
      });
    } else if (toRead.length > 0) {
      recs.push({
        id: 'backlog',
        priority: 5,
        icon: <Clock size={22} />,
        title: `${toRead.length} book${toRead.length === 1 ? '' : 's'} on your to-read list`,
        description: 'Browse your backlog and decide what comes next when you finish your current read.',
        action: () => onNavigate('library'),
        actionLabel: 'Browse backlog',
        accent: 'var(--text-muted)',
      });
    }

    // Recently finished — add notes or rate
    const recentlyFinished = books
      .filter((b) => b.status === 'read' && b.finishedAt)
      .sort((a, b) => Date.parse(b.finishedAt!) - Date.parse(a.finishedAt!))
      .slice(0, 3);
    const needsNotes = recentlyFinished.filter((b) => !b.notes?.trim());
    if (needsNotes.length > 0) {
      recs.push({
        id: 'add-notes',
        priority: 4,
        icon: <Star size={22} />,
        title: 'Add notes to finished books',
        description: `You finished ${needsNotes.length === 1 ? `"${needsNotes[0].title}"` : `${needsNotes.length} books`} without leaving notes. Capture your thoughts while they're fresh.`,
        action: () => onOpenBook(needsNotes[0].isbn),
        actionLabel: 'Add notes',
        accent: '#a855f7',
        books: needsNotes.slice(0, 3).map((b) => ({
          isbn: b.isbn,
          title: b.title,
          author: b.author,
          coverImg: b.coverImg,
        })),
      });
    }

    // Scan more books
    if (insights.totalBooks > 0 && insights.totalBooks < 20) {
      recs.push({
        id: 'grow-library',
        priority: 6,
        icon: <Scan size={22} />,
        title: 'Grow your library',
        description: `You have ${insights.totalBooks} book${insights.totalBooks === 1 ? '' : 's'} so far. Scan a few more to get the most out of search, shelves, and insights.`,
        action: () => onNavigate('scan'),
        actionLabel: 'Add more books',
        accent: 'var(--accent-blue)',
      });
    }

    // Cloud sync suggestion
    if (!user && insights.totalBooks >= 3) {
      recs.push({
        id: 'enable-sync',
        priority: 7,
        icon: <Cloud size={22} />,
        title: 'Back up your library',
        description: 'Enable cloud sync so you never lose your collection. It works across devices and is completely optional.',
        action: () => onNavigate('profile'),
        actionLabel: 'Set up sync',
        accent: '#06b6d4',
      });
    }

    // Completion milestone
    if (insights.readCount > 0 && insights.completionRate >= 50) {
      recs.push({
        id: 'milestone',
        priority: 8,
        icon: <TrendingUp size={22} />,
        title: `${insights.completionRate}% of your library read`,
        description: `You've finished ${insights.readCount} of ${insights.totalBooks} books and read ${insights.pagesRead.toLocaleString()} pages total. Keep it up!`,
        action: () => onNavigate('library'),
        actionLabel: 'View library',
        accent: '#22c55e',
      });
    }

    // If we somehow have no recommendations, fallback
    if (recs.length === 0) {
      recs.push({
        id: 'explore',
        priority: 1,
        icon: <Library size={22} />,
        title: 'Your library is in great shape',
        description: 'Everything looks good! Browse your collection, update reading progress, or scan new books.',
        action: () => onNavigate('library'),
        actionLabel: 'Browse library',
        accent: 'var(--accent-blue)',
      });
    }

    return recs.sort((a, b) => a.priority - b.priority);
  }, [books, insights, user, onNavigate, onOpenBook]);

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <span className={styles.badge}><CheckCircle2 size={14} /> Personalized for you</span>
        <h2 className={styles.pageTitle}>Next Steps</h2>
        <p className={styles.pageSubtitle}>
          {insights.totalBooks === 0
            ? 'Get started by adding books to your library.'
            : `Based on your ${insights.totalBooks} book${insights.totalBooks === 1 ? '' : 's'}, here's what to focus on next.`}
        </p>
      </div>

      {insights.totalBooks > 0 && (
        <div className={styles.statsRow}>
          <div className={`glass ${styles.miniStat}`}>
            <strong>{insights.totalBooks}</strong>
            <span>Total</span>
          </div>
          <div className={`glass ${styles.miniStat}`}>
            <strong>{insights.readingCount}</strong>
            <span>Reading</span>
          </div>
          <div className={`glass ${styles.miniStat}`}>
            <strong>{insights.readCount}</strong>
            <span>Finished</span>
          </div>
          <div className={`glass ${styles.miniStat}`}>
            <strong>{insights.toReadCount}</strong>
            <span>To read</span>
          </div>
          {insights.reviewCount > 0 && (
            <div className={`glass ${styles.miniStat} ${styles.miniStatWarning}`}>
              <strong>{insights.reviewCount}</strong>
              <span>Review</span>
            </div>
          )}
        </div>
      )}

      <div className={styles.recList}>
        {recommendations.map((rec) => (
          <div key={rec.id} className={`glass ${styles.recCard}`}>
            <div className={styles.recIcon} style={{ color: rec.accent }}>
              {rec.icon}
            </div>
            <div className={styles.recBody}>
              <h3 className={styles.recTitle}>{rec.title}</h3>
              <p className={styles.recDesc}>{rec.description}</p>

              {rec.books && rec.books.length > 0 && (
                <div className={styles.bookRow}>
                  {rec.books.map((book) => (
                    <button
                      key={book.isbn}
                      type="button"
                      className={styles.bookThumb}
                      onClick={() => onOpenBook(book.isbn)}
                      title={`${book.title} by ${book.author}`}
                    >
                      <img
                        src={getBookCoverSrc(book.coverImg)}
                        alt={book.title}
                        className={styles.bookImg}
                      />
                      <span className={styles.bookLabel}>{book.title}</span>
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                className={`glass ${styles.recAction}`}
                style={{ borderColor: rec.accent, color: rec.accent }}
                onClick={rec.action}
              >
                {rec.actionLabel} <ArrowRight size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
