import React, { useMemo } from 'react';
import { useBookStore } from '../store/useBookStore.ts';
import s from './ReadingInsights.module.css';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const ReadingInsights: React.FC = () => {
  const { books } = useBookStore();

  const insights = useMemo(() => {
    const now = new Date();
    const activeBooks = books.filter((b) => !b.deletedAt);
    const readBooks = activeBooks.filter((b) => b.status === 'read');
    const finishedBooks = readBooks.filter((b) => b.finishedAt);

    if (finishedBooks.length < 3) {
      return null;
    }

    // --- Section A: Books per month (last 12 months) ---
    const months: { key: string; label: string; year: number; month: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: getMonthKey(d),
        label: MONTH_LABELS[d.getMonth()],
        year: d.getFullYear(),
        month: d.getMonth(),
      });
    }

    const countByMonth: Record<string, number> = {};
    for (const m of months) countByMonth[m.key] = 0;

    for (const book of finishedBooks) {
      if (!book.finishedAt) continue;
      const d = new Date(book.finishedAt);
      const key = getMonthKey(d);
      if (key in countByMonth) {
        countByMonth[key]++;
      }
    }

    const monthData = months.map((m) => ({ ...m, count: countByMonth[m.key] }));
    const maxCount = Math.max(...monthData.map((m) => m.count), 1);

    // --- Section B: Reading stats ---
    // Average days to finish
    const booksWithDuration = readBooks.filter((b) => b.startedAt && b.finishedAt);
    let avgDays: number | null = null;
    if (booksWithDuration.length > 0) {
      const totalDays = booksWithDuration.reduce((sum, b) => {
        const start = new Date(b.startedAt!).getTime();
        const end = new Date(b.finishedAt!).getTime();
        const days = Math.max(0, (end - start) / (1000 * 60 * 60 * 24));
        return sum + days;
      }, 0);
      avgDays = Math.round(totalDays / booksWithDuration.length);
    }

    // Total pages read
    const totalPagesRead = readBooks.reduce((sum, b) => sum + (b.pageCount || 0), 0);

    // Streaks: consecutive months with >= 1 book finished
    // Build a set of month keys where a book was finished
    const finishedMonthSet = new Set<string>();
    for (const book of finishedBooks) {
      if (book.finishedAt) {
        finishedMonthSet.add(getMonthKey(new Date(book.finishedAt)));
      }
    }

    // Find longest streak
    // Get all unique months with books, sorted ascending
    const sortedMonthKeys = Array.from(finishedMonthSet).sort();

    function monthKeyToIndex(key: string): number {
      const [y, m] = key.split('-').map(Number);
      return y * 12 + m;
    }

    let longestStreak = 0;
    let currentStreakLen = 0;
    let prevIndex = -999;
    for (const key of sortedMonthKeys) {
      const idx = monthKeyToIndex(key);
      if (idx === prevIndex + 1) {
        currentStreakLen++;
      } else {
        currentStreakLen = 1;
      }
      longestStreak = Math.max(longestStreak, currentStreakLen);
      prevIndex = idx;
    }

    // Current streak: count backwards from current month
    let currentStreak = 0;
    for (let i = 0; i <= sortedMonthKeys.length; i++) {
      const checkKey = (() => {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        return getMonthKey(d);
      })();
      if (finishedMonthSet.has(checkKey)) {
        currentStreak++;
      } else {
        break;
      }
    }

    // --- Section C: Top Authors ---
    const authorCount: Record<string, number> = {};
    for (const book of activeBooks) {
      if (book.author) {
        authorCount[book.author] = (authorCount[book.author] || 0) + 1;
      }
    }
    const topAuthors = Object.entries(authorCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const maxAuthorCount = topAuthors.length > 0 ? topAuthors[0][1] : 1;

    return {
      monthData,
      maxCount,
      avgDays,
      totalPagesRead,
      longestStreak,
      currentStreak,
      topAuthors,
      maxAuthorCount,
    };
  }, [books]);

  if (!insights) {
    return (
      <div className={s.emptyState}>
        Finish 3 or more books to see your reading insights.
      </div>
    );
  }

  const {
    monthData,
    maxCount,
    avgDays,
    totalPagesRead,
    longestStreak,
    currentStreak,
    topAuthors,
    maxAuthorCount,
  } = insights;

  const CHART_HEIGHT = 80; // px, the drawable area for bars

  return (
    <div className={s.root}>
      {/* Section A: Books per Month */}
      <div className={s.sectionBlock}>
        <div className={s.sectionLabel}>Books finished per month</div>
        <div className={s.barChart} aria-label="Books finished per month bar chart">
          {monthData.map((m) => {
            const barH = maxCount > 0 ? Math.round((m.count / maxCount) * CHART_HEIGHT) : 0;
            return (
              <div key={m.key} className={s.barCol}>
                <div className={s.barCountLabel}>{m.count > 0 ? m.count : ''}</div>
                <div className={s.barTrack} style={{ height: CHART_HEIGHT }}>
                  <div
                    className={s.bar}
                    style={{ height: barH }}
                    aria-label={`${m.label}: ${m.count} books`}
                  />
                </div>
                <div className={s.barMonthLabel}>{m.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section B: Reading Stats */}
      <div className={s.sectionBlock}>
        <div className={s.sectionLabel}>Reading stats</div>
        <div className={s.statsGrid}>
          {avgDays !== null && (
            <div className={s.statCard}>
              <div className={s.statValue}>{avgDays}</div>
              <div className={s.statMeta}>avg days to finish</div>
            </div>
          )}
          <div className={s.statCard}>
            <div className={s.statValue}>{longestStreak}</div>
            <div className={s.statMeta}>longest streak (months)</div>
          </div>
          <div className={s.statCard}>
            <div className={s.statValue}>{currentStreak}</div>
            <div className={s.statMeta}>current streak (months)</div>
          </div>
          <div className={s.statCard}>
            <div className={s.statValue}>{totalPagesRead.toLocaleString()}</div>
            <div className={s.statMeta}>total pages read</div>
          </div>
        </div>
      </div>

      {/* Section C: Top Authors */}
      {topAuthors.length > 0 && (
        <div className={s.sectionBlock}>
          <div className={s.sectionLabel}>Top authors</div>
          <div className={s.authorList}>
            {topAuthors.map(([author, count]) => {
              const pct = Math.round((count / maxAuthorCount) * 100);
              return (
                <div key={author} className={s.authorRow}>
                  <div className={s.authorName}>{author}</div>
                  <div className={s.authorBarTrack}>
                    <div
                      className={s.authorBar}
                      style={{ width: `${pct}%` }}
                      aria-label={`${author}: ${count} books`}
                    />
                  </div>
                  <div className={s.authorCount}>{count}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReadingInsights;
