import React, { useMemo } from 'react';
import { TrendingUp, BookOpen, Lightbulb, Copy, Star, Clock3 } from 'lucide-react';
import type { BookEntry } from '../types.ts';
import { generateAdvancedInsights } from '../utils/insightsEngine.ts';
import { findDuplicates } from '../utils/duplicateDetector.ts';
import s from './InsightsPanel.module.css';

interface InsightsPanelProps {
  books: BookEntry[];
}

const REASON_LABELS: Record<string, string> = {
  same_isbn: 'Same ISBN',
  similar_title: 'Similar title',
  same_author_similar_title: 'Same author, similar title',
};

const InsightsPanel: React.FC<InsightsPanelProps> = ({ books }) => {
  const insights = useMemo(() => generateAdvancedInsights(books), [books]);
  const duplicates = useMemo(() => findDuplicates(books), [books]);

  if (books.length === 0) {
    return (
      <div className={s.insightsPanel}>
        <div className={s.emptyState}>
          Add some books to your library to unlock insights and recommendations.
        </div>
      </div>
    );
  }

  const maxAuthorCount = insights.favoriteAuthors[0]?.count ?? 1;

  return (
    <div className={s.insightsPanel}>
      {/* Top Authors */}
      {insights.favoriteAuthors.length > 0 && (
        <div className={s.card}>
          <div className={s.cardHeader}>
            <div>
              <h3 className={s.cardTitle}>Top authors</h3>
              <p className={s.cardSubtitle}>Most collected authors in your library.</p>
            </div>
            <div className={s.cardIconBlue}>
              <TrendingUp size={16} />
            </div>
          </div>
          <div className={s.authorList}>
            {insights.favoriteAuthors.map((item) => (
              <div key={item.author} className={s.authorRow}>
                <span className={s.authorName} title={item.author}>
                  {item.author}
                </span>
                <div className={s.authorBarTrack}>
                  <div
                    className={s.authorBarFill}
                    style={{ width: `${(item.count / maxAuthorCount) * 100}%` }}
                  />
                </div>
                <span className={s.authorCount}>{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completion Stats */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <div>
            <h3 className={s.cardTitle}>Completion insights</h3>
            <p className={s.cardSubtitle}>How you finish what you start.</p>
          </div>
          <div className={s.cardIconPurple}>
            <Star size={16} />
          </div>
        </div>
        <div className={s.completionGrid}>
          <div className={s.completionStat}>
            <div className={s.completionStatValue}>{insights.completionRate}%</div>
            <div className={s.completionStatLabel}>Completion rate</div>
          </div>
          <div className={s.completionStat}>
            <div className={s.completionStatValue}>{insights.dnfRate}%</div>
            <div className={s.completionStatLabel}>DNF rate</div>
          </div>
          <div className={s.completionStat}>
            <div className={s.completionStatValue}>
              {insights.averageRating > 0 ? insights.averageRating.toFixed(1) : '--'}
            </div>
            <div className={s.completionStatLabel}>Avg rating</div>
          </div>
        </div>
      </div>

      {/* Backlog Analysis */}
      {insights.unreadBacklogSize > 0 && (
        <div className={s.card}>
          <div className={s.cardHeader}>
            <div>
              <h3 className={s.cardTitle}>Backlog analysis</h3>
              <p className={s.cardSubtitle}>Your unread queue at a glance.</p>
            </div>
            <div className={s.cardIconAmber}>
              <Clock3 size={16} />
            </div>
          </div>
          <div className={s.backlogGrid}>
            <div className={s.backlogStat}>
              <div className={s.backlogStatValue}>{insights.unreadBacklogSize}</div>
              <div className={s.backlogStatLabel}>Unread books</div>
            </div>
            <div className={s.backlogStat}>
              <div className={s.backlogStatValue}>
                {insights.unreadBacklogPages.toLocaleString()}
              </div>
              <div className={s.backlogStatLabel}>Pages queued</div>
            </div>
            <div className={s.backlogStat}>
              <div className={s.backlogStatValue}>
                {insights.averageBookLength > 0 ? insights.averageBookLength : '--'}
              </div>
              <div className={s.backlogStatLabel}>Avg length</div>
            </div>
          </div>
          <div className={s.estimateLabel}>
            Estimated time to clear: <strong>{insights.estimatedReadingTime}</strong>
            {insights.oldestUnread && (
              <>
                {' '}
                &middot; Oldest unread: <strong>{insights.oldestUnread.title}</strong>
              </>
            )}
          </div>
        </div>
      )}

      {/* Fun Facts */}
      {insights.funFacts.length > 0 && (
        <div className={s.card}>
          <div className={s.cardHeader}>
            <div>
              <h3 className={s.cardTitle}>Fun facts</h3>
              <p className={s.cardSubtitle}>Interesting patterns from your library.</p>
            </div>
            <div className={s.cardIconBlue}>
              <Lightbulb size={16} />
            </div>
          </div>
          <div className={s.factsList}>
            {insights.funFacts.map((fact, i) => (
              <div key={i} className={s.factItem}>
                <span className={s.factBullet}>&#9679;</span>
                <span>{fact}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Next Reads */}
      {insights.suggestedNextReads.length > 0 && (
        <div className={s.card}>
          <div className={s.cardHeader}>
            <div>
              <h3 className={s.cardTitle}>Suggested next reads</h3>
              <p className={s.cardSubtitle}>
                Prioritized picks from your backlog based on your patterns.
              </p>
            </div>
            <div className={s.cardIconPurple}>
              <BookOpen size={16} />
            </div>
          </div>
          <div className={s.suggestedGrid}>
            {insights.suggestedNextReads.map((book) => (
              <article key={book.id} className={s.suggestedCard}>
                <div className={s.suggestedCover}>
                  {book.coverImg ? (
                    <img src={book.coverImg} alt="" />
                  ) : (
                    <div className={s.suggestedFallback}>
                      {book.title.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className={s.suggestedInfo}>
                  <div className={s.suggestedTitle}>{book.title}</div>
                  <div className={s.suggestedAuthor}>{book.author}</div>
                  {book.pageCount > 0 && (
                    <div className={s.suggestedPages}>{book.pageCount} pages</div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* Duplicate Detection */}
      {duplicates.length > 0 && (
        <div className={s.card}>
          <div className={s.cardHeader}>
            <div>
              <h3 className={s.cardTitle}>Potential duplicates</h3>
              <p className={s.cardSubtitle}>
                Books that might be duplicated in your library.
              </p>
            </div>
            <div className={s.cardIconRose}>
              <Copy size={16} />
            </div>
          </div>
          {duplicates.map((group, i) => (
            <div key={i} className={s.duplicateGroup}>
              <div className={s.duplicateReason}>{REASON_LABELS[group.reason] ?? group.reason}</div>
              <div className={s.duplicateBooks}>
                {group.books.map((book) => (
                  <div key={book.id} className={s.duplicateBookRow}>
                    <span className={s.duplicateBookTitle}>{book.title}</span>
                    <span className={s.duplicateBookAuthor}>{book.author}</span>
                    <span className={s.duplicateConfidence}>
                      {Math.round(group.confidence * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className={s.duplicateHint}>
            Review these entries and consider merging or removing duplicates.
          </div>
        </div>
      )}
    </div>
  );
};

export default InsightsPanel;
