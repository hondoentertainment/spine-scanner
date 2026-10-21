import { createLibraryStore } from '../../packages/shared/src/libraryStore.ts';
import type { ProfilePreferences } from '../types.ts';
import { localDateKey } from '../utils/formatDate.ts';
import { useProfileStore } from './useProfileStore.ts';

export function toLocalDateKey(d: Date): string {
  return localDateKey(d);
}

export function advanceStreak(prefs: ProfilePreferences): Partial<ProfilePreferences> {
  const todayDate = new Date();
  const yesterdayDate = new Date(todayDate);
  yesterdayDate.setDate(todayDate.getDate() - 1);
  const today = toLocalDateKey(todayDate);
  const yesterday = toLocalDateKey(yesterdayDate);

  if (prefs.lastStreakDate === today) {
    return {};
  }
  if (prefs.lastStreakDate === yesterday) {
    const next = prefs.currentStreak + 1;
    return {
      currentStreak: next,
      longestStreak: Math.max(prefs.longestStreak, next),
      lastStreakDate: today,
    };
  }
  return {
    currentStreak: 1,
    longestStreak: Math.max(prefs.longestStreak, 1),
    lastStreakDate: today,
  };
}

function recordReadingActivity(): void {
  const prefs = useProfileStore.getState().preferences;
  useProfileStore.getState().updatePreferences(advanceStreak(prefs));
}

export const useBookStore = createLibraryStore({
  onReadingActivity: recordReadingActivity,
});
