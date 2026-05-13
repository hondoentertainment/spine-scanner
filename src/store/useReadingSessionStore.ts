import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ReadingSession } from '../types.ts';

function toLocalDateKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

interface ReadingSessionStore {
  sessions: ReadingSession[];
  activeBookId: string | null;
  activeStartMs: number | null;

  startSession: (bookId: string) => void;
  stopSession: (bookId: string, pagesRead: number) => void;
  cancelSession: () => void;
  addSession: (session: ReadingSession) => void;
  removeSession: (id: string) => void;
  sessionsForBook: (bookId: string) => ReadingSession[];
  stats: (bookId?: string) => {
    totalSessions: number;
    totalMinutes: number;
    totalPages: number;
    avgPagesPerHour: number;
    longestSessionMin: number;
    sessionsThisWeek: number;
  };
}

export const useReadingSessionStore = create<ReadingSessionStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeBookId: null,
      activeStartMs: null,

      startSession: (bookId) => {
        set({ activeBookId: bookId, activeStartMs: Date.now() });
      },

      stopSession: (bookId, pagesRead) => {
        const { activeStartMs } = get();
        if (activeStartMs === null) return;
        const durationMin = Math.max(1, Math.round((Date.now() - activeStartMs) / 60000));
        const session: ReadingSession = {
          id: crypto.randomUUID(),
          bookId,
          durationMin,
          pagesRead,
          date: toLocalDateKey(new Date()),
        };
        set((state) => ({
          sessions: [...state.sessions, session],
          activeBookId: null,
          activeStartMs: null,
        }));
      },

      cancelSession: () => {
        set({ activeBookId: null, activeStartMs: null });
      },

      addSession: (session) => {
        set((state) => ({ sessions: [...state.sessions, session] }));
      },

      removeSession: (id) => {
        set((state) => ({ sessions: state.sessions.filter((s) => s.id !== id) }));
      },

      sessionsForBook: (bookId) => {
        return get().sessions.filter((s) => s.bookId === bookId);
      },

      stats: (bookId?) => {
        const all = bookId
          ? get().sessions.filter((s) => s.bookId === bookId)
          : get().sessions;

        const now = new Date();
        const weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 6);
        const weekAgoKey = toLocalDateKey(weekAgo);
        const todayKey = toLocalDateKey(now);

        const totalSessions = all.length;
        const totalMinutes = all.reduce((sum, s) => sum + s.durationMin, 0);
        const totalPages = all.reduce((sum, s) => sum + s.pagesRead, 0);
        const avgPagesPerHour =
          totalMinutes > 0 ? Math.round((totalPages / totalMinutes) * 60) : 0;
        const longestSessionMin =
          all.length > 0 ? Math.max(...all.map((s) => s.durationMin)) : 0;
        const sessionsThisWeek = all.filter(
          (s) => s.date >= weekAgoKey && s.date <= todayKey,
        ).length;

        return {
          totalSessions,
          totalMinutes,
          totalPages,
          avgPagesPerHour,
          longestSessionMin,
          sessionsThisWeek,
        };
      },
    }),
    {
      name: 'spine-scanner-reading-sessions',
      partialize: (state) => ({ sessions: state.sessions }),
    }
  )
);
