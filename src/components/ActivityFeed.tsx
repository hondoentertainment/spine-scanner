import React from 'react';
import { useActivityStore } from '../store/useActivityStore.ts';
import { formatRelativeTime } from '../utils/formatRelativeTime.ts';
import type { ActivityEntry } from '../types.ts';
import {
  BookPlus, CheckCircle, HandHelping, RotateCcw, RefreshCw, Star,
} from 'lucide-react';
import s from './ActivityFeed.module.css';

const typeConfig: Record<ActivityEntry['type'], { label: string; icon: React.ReactNode }> = {
  book_added: { label: 'Added', icon: <BookPlus size={14} /> },
  book_finished: { label: 'Finished', icon: <CheckCircle size={14} /> },
  book_lent: { label: 'Lent', icon: <HandHelping size={14} /> },
  book_returned: { label: 'Returned', icon: <RotateCcw size={14} /> },
  status_changed: { label: 'Updated', icon: <RefreshCw size={14} /> },
  rating_added: { label: 'Rated', icon: <Star size={14} /> },
};

interface ActivityFeedProps {
  limit?: number;
}

const ActivityFeed: React.FC<ActivityFeedProps> = ({ limit = 20 }) => {
  const entries = useActivityStore((state) => state.getRecentEntries(limit));

  if (entries.length === 0) {
    return (
      <div className={s.feed}>
        <h4 className={s.feedTitle}>Recent activity</h4>
        <div className={s.empty}>No activity yet. Scan or add a book to get started.</div>
      </div>
    );
  }

  return (
    <div className={s.feed}>
      <h4 className={s.feedTitle}>Recent activity</h4>
      <div className={s.timeline}>
        {entries.map((entry) => {
          const config = typeConfig[entry.type];
          return (
            <div key={entry.id} className={s.entry}>
              <div className={`${s.icon} ${s[`icon_${entry.type}`]}`}>
                {config.icon}
              </div>
              <div className={s.entryBody}>
                <div className={s.entryText}>
                  {config.label}{' '}
                  <span className={s.entryBookTitle}>{entry.bookTitle}</span>
                </div>
                {entry.detail && <div className={s.entryDetail}>{entry.detail}</div>}
              </div>
              <span className={s.entryTime}>{formatRelativeTime(entry.timestamp)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ActivityFeed;
