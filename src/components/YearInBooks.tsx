import React, { useMemo, useState, useCallback } from 'react';
import { Share2 } from 'lucide-react';
import type { BookEntry } from '../types.ts';
import { getTopAuthors } from '../utils/insightsEngine.ts';
import s from './YearInBooks.module.css';

interface YearInBooksProps {
  books: BookEntry[];
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getBooksForYear(books: BookEntry[], year: number): BookEntry[] {
  return books.filter((b) => {
    if (b.status !== 'read') return false;
    const finished = b.finishedReading ?? b.dateAdded;
    if (!finished) return false;
    return new Date(finished).getFullYear() === year;
  });
}

function getMonthlyBreakdown(books: BookEntry[], year: number): number[] {
  const counts = Array(12).fill(0) as number[];
  for (const book of books) {
    const finished = book.finishedReading ?? book.dateAdded;
    if (!finished) continue;
    const d = new Date(finished);
    if (d.getFullYear() === year) {
      counts[d.getMonth()]++;
    }
  }
  return counts;
}

const YearInBooks: React.FC<YearInBooksProps> = ({ books }) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [copied, setCopied] = useState(false);

  const yearBooks = useMemo(() => getBooksForYear(books, selectedYear), [books, selectedYear]);
  const monthly = useMemo(() => getMonthlyBreakdown(yearBooks, selectedYear), [yearBooks, selectedYear]);
  const totalPages = useMemo(
    () => yearBooks.reduce((sum, b) => sum + (b.pageCount || 0), 0),
    [yearBooks],
  );
  const topAuthors = useMemo(() => getTopAuthors(yearBooks, 3), [yearBooks]);
  const ratedBooks = useMemo(
    () => yearBooks.filter((b) => b.rating != null && b.rating > 0),
    [yearBooks],
  );
  const avgRating = useMemo(
    () =>
      ratedBooks.length > 0
        ? Math.round((ratedBooks.reduce((sum, b) => sum + b.rating!, 0) / ratedBooks.length) * 10) / 10
        : 0,
    [ratedBooks],
  );

  const maxMonthly = Math.max(...monthly, 1);
  const years = [currentYear, currentYear - 1];

  const handleShare = useCallback(() => {
    const lines: string[] = [
      `My ${selectedYear} Year in Books`,
      '',
      `Books read: ${yearBooks.length}`,
      `Pages read: ${totalPages.toLocaleString()}`,
    ];
    if (avgRating > 0) lines.push(`Average rating: ${avgRating}/5`);
    if (topAuthors.length > 0) {
      lines.push(`Top authors: ${topAuthors.map((a) => `${a.author} (${a.count})`).join(', ')}`);
    }
    lines.push('', 'Tracked with Spine Scanner');

    const text = lines.join('\n');

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, [selectedYear, yearBooks, totalPages, avgRating, topAuthors]);

  return (
    <div className={s.yearInBooks}>
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h3 className={s.title}>Year in Books</h3>
          <p className={s.subtitle}>Your reading summary for {selectedYear}.</p>
        </div>
        <div className={s.controls}>
          {years.map((year) => (
            <button
              key={year}
              type="button"
              className={`${s.yearBtn} ${selectedYear === year ? s.yearBtnActive : ''}`}
              onClick={() => setSelectedYear(year)}
            >
              {year}
            </button>
          ))}
          <button type="button" className={s.shareBtn} onClick={handleShare}>
            <Share2 size={14} />
            {copied ? 'Copied!' : 'Share'}
          </button>
        </div>
      </div>

      {yearBooks.length === 0 ? (
        <div className={s.emptyState}>
          No books finished in {selectedYear} yet. Mark books as &ldquo;read&rdquo; to build your year in review.
        </div>
      ) : (
        <>
          {/* Hero Stats */}
          <div className={s.heroGrid}>
            <div className={s.heroStat}>
              <div className={s.heroStatValue}>{yearBooks.length}</div>
              <div className={s.heroStatLabel}>Books read</div>
            </div>
            <div className={s.heroStat}>
              <div className={s.heroStatValue}>{totalPages.toLocaleString()}</div>
              <div className={s.heroStatLabel}>Pages</div>
            </div>
            <div className={s.heroStat}>
              <div className={s.heroStatValue}>{avgRating > 0 ? avgRating.toFixed(1) : '--'}</div>
              <div className={s.heroStatLabel}>Avg rating</div>
            </div>
            <div className={s.heroStat}>
              <div className={s.heroStatValue}>{new Set(yearBooks.map((b) => b.author.trim())).size}</div>
              <div className={s.heroStatLabel}>Authors</div>
            </div>
          </div>

          {/* Top Authors */}
          {topAuthors.length > 0 && (
            <div>
              <div className={s.sectionLabel}>Top authors</div>
              <div className={s.topAuthorsRow}>
                {topAuthors.map((a) => (
                  <span key={a.author} className={s.topAuthorChip}>
                    <strong>{a.author}</strong> &middot; {a.count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Monthly Chart */}
          <div className={s.card}>
            <div className={s.sectionLabel}>Monthly breakdown</div>
            <div className={s.monthlyChart}>
              {monthly.map((count, i) => (
                <div key={i} className={s.monthCol}>
                  {count > 0 && <span className={s.monthCount}>{count}</span>}
                  <div
                    className={s.monthBar}
                    style={{ height: `${Math.max((count / maxMonthly) * 100, count > 0 ? 8 : 2)}%` }}
                    title={`${MONTH_LABELS[i]}: ${count} book${count !== 1 ? 's' : ''}`}
                  />
                  <span className={s.monthLabel}>{MONTH_LABELS[i]}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default YearInBooks;
