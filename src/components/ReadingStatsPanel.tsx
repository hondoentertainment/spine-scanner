import React, { useMemo } from 'react';
import { BarChart3, Star } from 'lucide-react';
import type { BookEntry } from '../types.ts';
import { calculateReadingStats } from '../utils/readingStats.ts';
import s from './ReadingStatsPanel.module.css';

interface ReadingStatsPanelProps {
  books: BookEntry[];
  yearlyGoal?: number;
}

const ReadingStatsPanel: React.FC<ReadingStatsPanelProps> = ({ books, yearlyGoal }) => {
  const stats = useMemo(() => calculateReadingStats(books, yearlyGoal), [books, yearlyGoal]);

  const maxMonthly = Math.max(...stats.monthlyReading.map((m) => m.count), 1);
  const maxRating = Math.max(...Object.values(stats.ratingDistribution), 1);

  const hasAnyData = stats.booksReadThisYear > 0 || stats.booksReadLastYear > 0 || stats.totalPagesRead > 0;

  if (!hasAnyData) {
    return (
      <div className={s.panel}>
        <div className={s.panelHeader}>
          <div>
            <h3 className={s.panelTitle}>Reading insights</h3>
            <p className={s.panelSubtitle}>Detailed stats will appear here once you start tracking reading progress.</p>
          </div>
          <div className={s.panelIcon}>
            <BarChart3 size={16} />
          </div>
        </div>
        <div className={s.emptyState}>
          Mark books as read with finish dates to unlock reading insights.
        </div>
      </div>
    );
  }

  return (
    <div className={s.panel}>
      <div className={s.panelHeader}>
        <div>
          <h3 className={s.panelTitle}>Reading insights</h3>
          <p className={s.panelSubtitle}>Your reading habits and patterns at a glance.</p>
        </div>
        <div className={s.panelIcon}>
          <BarChart3 size={16} />
        </div>
      </div>

      {/* Goal progress */}
      {yearlyGoal != null && yearlyGoal > 0 && (
        <div className={s.goalSection}>
          <div className={s.goalRow}>
            <div className={s.goalBarTrack}>
              <div
                className={s.goalBarFill}
                style={{ width: `${stats.yearlyGoalProgress}%` }}
              />
            </div>
            <span className={s.goalLabel}>
              <span className={s.goalValue}>{stats.booksReadThisYear}</span> / {yearlyGoal}
            </span>
          </div>
          <p className={s.goalLabel}>{stats.yearlyGoalProgress}% of yearly reading goal</p>
        </div>
      )}

      {/* Key stats */}
      <div className={s.statsGrid}>
        <div className={s.statCard}>
          <div className={s.statValue}>{stats.booksReadThisYear}</div>
          <div className={s.statLabel}>Read this year</div>
        </div>
        <div className={s.statCard}>
          <div className={s.statValue}>{stats.totalPagesRead.toLocaleString()}</div>
          <div className={s.statLabel}>Total pages</div>
        </div>
        <div className={s.statCard}>
          <div className={s.statValue}>{stats.averagePagesPerBook}</div>
          <div className={s.statLabel}>Avg pages/book</div>
        </div>
      </div>

      {/* Monthly chart */}
      <div className={s.chartSection}>
        <div className={s.chartTitle}>Books finished by month</div>
        <div className={s.chart}>
          {stats.monthlyReading.map((m) => (
            <div key={m.month} className={s.chartCol}>
              {m.count > 0 && <span className={s.chartCount}>{m.count}</span>}
              <div
                className={s.chartBar}
                style={{ height: `${Math.max((m.count / maxMonthly) * 100, m.count > 0 ? 8 : 2)}%` }}
              />
              <span className={s.chartLabel}>{m.month.split(' ')[0]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Rating distribution */}
      {stats.averageRating > 0 && (
        <div className={s.ratingSection}>
          <div className={s.ratingTitle}>
            Rating distribution (avg: {stats.averageRating})
          </div>
          <div className={s.ratingRows}>
            {[5, 4, 3, 2, 1].map((star) => (
              <div key={star} className={s.ratingRow}>
                <span className={s.ratingStars}>
                  {star} <Star size={10} fill="currentColor" />
                </span>
                <div className={s.ratingBarTrack}>
                  <div
                    className={s.ratingBarFill}
                    style={{ width: `${(stats.ratingDistribution[star] / maxRating) * 100}%` }}
                  />
                </div>
                <span className={s.ratingCount}>{stats.ratingDistribution[star]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Streak */}
      <div className={s.streakRow}>
        <div className={s.streakCard}>
          <div className={s.streakValue}>{stats.currentStreak}</div>
          <div className={s.streakLabel}>Current streak (days)</div>
        </div>
        <div className={s.streakCard}>
          <div className={s.streakValue}>{stats.longestStreak}</div>
          <div className={s.streakLabel}>Longest streak (days)</div>
        </div>
      </div>
    </div>
  );
};

export default ReadingStatsPanel;
