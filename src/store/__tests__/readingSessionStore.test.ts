import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useReadingSessionStore } from '../useReadingSessionStore';
import type { ReadingSession } from '../../types';

const makeSession = (overrides: Partial<ReadingSession> = {}): ReadingSession => ({
  id: crypto.randomUUID(),
  bookId: 'book-1',
  durationMin: 30,
  pagesRead: 20,
  date: '2026-05-13',
  ...overrides,
});

describe('useReadingSessionStore', () => {
  beforeEach(() => {
    useReadingSessionStore.setState({
      sessions: [],
      activeBookId: null,
      activeStartMs: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with empty state', () => {
    const { sessions, activeBookId, activeStartMs } = useReadingSessionStore.getState();
    expect(sessions).toEqual([]);
    expect(activeBookId).toBeNull();
    expect(activeStartMs).toBeNull();
  });

  describe('startSession', () => {
    it('sets activeBookId and activeStartMs', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-13T10:00:00Z'));
      useReadingSessionStore.getState().startSession('book-1');
      const { activeBookId, activeStartMs } = useReadingSessionStore.getState();
      expect(activeBookId).toBe('book-1');
      expect(activeStartMs).toBe(new Date('2026-05-13T10:00:00Z').getTime());
    });

    it('overwrites any previous active session silently', () => {
      useReadingSessionStore.getState().startSession('book-1');
      useReadingSessionStore.getState().startSession('book-2');
      expect(useReadingSessionStore.getState().activeBookId).toBe('book-2');
    });
  });

  describe('stopSession', () => {
    it('creates a session with correct durationMin', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-13T10:00:00Z'));
      useReadingSessionStore.getState().startSession('book-1');

      vi.setSystemTime(new Date('2026-05-13T10:25:00Z'));
      useReadingSessionStore.getState().stopSession('book-1', 10);

      const { sessions } = useReadingSessionStore.getState();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].durationMin).toBe(25);
      expect(sessions[0].pagesRead).toBe(10);
      expect(sessions[0].bookId).toBe('book-1');
    });

    it('clamps durationMin to minimum 1', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-13T10:00:00.000Z'));
      useReadingSessionStore.getState().startSession('book-1');

      vi.setSystemTime(new Date('2026-05-13T10:00:00.100Z'));
      useReadingSessionStore.getState().stopSession('book-1', 0);

      const { sessions } = useReadingSessionStore.getState();
      expect(sessions[0].durationMin).toBe(1);
    });

    it('clears activeBookId and activeStartMs after stop', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-13T10:00:00Z'));
      useReadingSessionStore.getState().startSession('book-1');
      vi.setSystemTime(new Date('2026-05-13T10:10:00Z'));
      useReadingSessionStore.getState().stopSession('book-1', 5);

      const { activeBookId, activeStartMs } = useReadingSessionStore.getState();
      expect(activeBookId).toBeNull();
      expect(activeStartMs).toBeNull();
    });

    it('does nothing if no active session exists', () => {
      useReadingSessionStore.getState().stopSession('book-1', 0);
      expect(useReadingSessionStore.getState().sessions).toHaveLength(0);
    });
  });

  describe('cancelSession', () => {
    it('clears active state without adding a session', () => {
      useReadingSessionStore.getState().startSession('book-1');
      useReadingSessionStore.getState().cancelSession();

      const { sessions, activeBookId, activeStartMs } = useReadingSessionStore.getState();
      expect(sessions).toHaveLength(0);
      expect(activeBookId).toBeNull();
      expect(activeStartMs).toBeNull();
    });
  });

  describe('addSession / removeSession', () => {
    it('adds a session manually', () => {
      const session = makeSession({ id: 'manual-1' });
      useReadingSessionStore.getState().addSession(session);
      expect(useReadingSessionStore.getState().sessions).toHaveLength(1);
    });

    it('removes a session by id', () => {
      useReadingSessionStore.getState().addSession(makeSession({ id: 'a' }));
      useReadingSessionStore.getState().addSession(makeSession({ id: 'b' }));
      useReadingSessionStore.getState().removeSession('a');
      const { sessions } = useReadingSessionStore.getState();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('b');
    });
  });

  describe('sessionsForBook', () => {
    it('filters sessions by bookId', () => {
      useReadingSessionStore.getState().addSession(makeSession({ id: '1', bookId: 'book-1' }));
      useReadingSessionStore.getState().addSession(makeSession({ id: '2', bookId: 'book-2' }));
      useReadingSessionStore.getState().addSession(makeSession({ id: '3', bookId: 'book-1' }));

      const result = useReadingSessionStore.getState().sessionsForBook('book-1');
      expect(result).toHaveLength(2);
      expect(result.every((s) => s.bookId === 'book-1')).toBe(true);
    });
  });

  describe('stats', () => {
    it('returns correct aggregates for multiple sessions', () => {
      useReadingSessionStore.getState().addSession(makeSession({ id: '1', durationMin: 30, pagesRead: 30 }));
      useReadingSessionStore.getState().addSession(makeSession({ id: '2', durationMin: 60, pagesRead: 60 }));
      useReadingSessionStore.getState().addSession(makeSession({ id: '3', durationMin: 45, pagesRead: 45 }));

      const s = useReadingSessionStore.getState().stats();
      expect(s.totalSessions).toBe(3);
      expect(s.totalMinutes).toBe(135);
      expect(s.totalPages).toBe(135);
      expect(s.avgPagesPerHour).toBe(60);
      expect(s.longestSessionMin).toBe(60);
    });

    it('filters stats by bookId', () => {
      useReadingSessionStore.getState().addSession(makeSession({ id: '1', bookId: 'book-1', durationMin: 30, pagesRead: 20 }));
      useReadingSessionStore.getState().addSession(makeSession({ id: '2', bookId: 'book-2', durationMin: 60, pagesRead: 50 }));

      const s = useReadingSessionStore.getState().stats('book-1');
      expect(s.totalSessions).toBe(1);
      expect(s.totalMinutes).toBe(30);
      expect(s.totalPages).toBe(20);
    });

    it('returns zeros for empty sessions', () => {
      const s = useReadingSessionStore.getState().stats();
      expect(s.totalSessions).toBe(0);
      expect(s.totalMinutes).toBe(0);
      expect(s.totalPages).toBe(0);
      expect(s.avgPagesPerHour).toBe(0);
      expect(s.longestSessionMin).toBe(0);
      expect(s.sessionsThisWeek).toBe(0);
    });

    describe('sessionsThisWeek', () => {
      it('counts sessions within the past 7 days including today', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-13T12:00:00Z'));

        useReadingSessionStore.getState().addSession(makeSession({ id: '1', date: '2026-05-13' }));
        useReadingSessionStore.getState().addSession(makeSession({ id: '2', date: '2026-05-07' }));
        useReadingSessionStore.getState().addSession(makeSession({ id: '3', date: '2026-05-06' }));

        const s = useReadingSessionStore.getState().stats();
        expect(s.sessionsThisWeek).toBe(2);
      });

      it('excludes sessions older than 7 days', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-13T12:00:00Z'));

        useReadingSessionStore.getState().addSession(makeSession({ id: '1', date: '2026-05-01' }));
        useReadingSessionStore.getState().addSession(makeSession({ id: '2', date: '2026-04-30' }));

        const s = useReadingSessionStore.getState().stats();
        expect(s.sessionsThisWeek).toBe(0);
      });
    });
  });
});
