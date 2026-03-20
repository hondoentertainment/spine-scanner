import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReadingProgress from '../ReadingProgress';
import type { BookEntry } from '../../types';

/* ================================================================
 *  Helpers
 * ================================================================ */

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'rp-1',
  isbn: '9780141036144',
  title: '1984',
  author: 'George Orwell',
  pageCount: 328,
  amazonLink: '',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: '2026-01-15T00:00:00.000Z',
  shelfIds: [],
  ...overrides,
});

/* ================================================================
 *  Tests
 * ================================================================ */

describe('ReadingProgress', () => {
  /* ── Rendering ──────────────────────────────────────────── */
  describe('rendering', () => {
    it('renders the progress bar', () => {
      const book = makeBook({ pagesRead: 100, progressPercent: 30 });
      render(<ReadingProgress book={book} onUpdate={vi.fn()} />);

      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toBeInTheDocument();
      expect(progressbar).toHaveAttribute('aria-valuenow', '30');
    });

    it('shows percentage label', () => {
      const book = makeBook({ progressPercent: 50 });
      render(<ReadingProgress book={book} onUpdate={vi.fn()} />);

      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('shows pages input when pageCount > 0', () => {
      const book = makeBook({ pageCount: 328 });
      render(<ReadingProgress book={book} onUpdate={vi.fn()} />);

      expect(screen.getByLabelText('Pages read')).toBeInTheDocument();
      expect(screen.getByText(/\/ 328 pp/)).toBeInTheDocument();
    });

    it('hides pages input when pageCount is 0', () => {
      const book = makeBook({ pageCount: 0 });
      render(<ReadingProgress book={book} onUpdate={vi.fn()} />);

      expect(screen.queryByLabelText('Pages read')).not.toBeInTheDocument();
    });

    it('calculates percent from pagesRead when progressPercent is missing', () => {
      const book = makeBook({ pagesRead: 164, pageCount: 328 });
      render(<ReadingProgress book={book} onUpdate={vi.fn()} />);

      expect(screen.getByText('50%')).toBeInTheDocument();
    });
  });

  /* ── Start Reading ─────────────────────────────────────── */
  describe('Start Reading button', () => {
    it('shows Start Reading for to-read books', () => {
      const book = makeBook({ status: 'to-read' });
      render(<ReadingProgress book={book} onUpdate={vi.fn()} />);

      expect(screen.getByLabelText('Start Reading')).toBeInTheDocument();
    });

    it('hides Start Reading for currently reading books', () => {
      const book = makeBook({ status: 'reading' });
      render(<ReadingProgress book={book} onUpdate={vi.fn()} />);

      expect(screen.queryByLabelText('Start Reading')).not.toBeInTheDocument();
    });

    it('hides Start Reading for read books', () => {
      const book = makeBook({ status: 'read' });
      render(<ReadingProgress book={book} onUpdate={vi.fn()} />);

      expect(screen.queryByLabelText('Start Reading')).not.toBeInTheDocument();
    });

    it('sets status to reading and startedReading on click', () => {
      const onUpdate = vi.fn();
      const book = makeBook({ status: 'to-read' });
      render(<ReadingProgress book={book} onUpdate={onUpdate} />);

      fireEvent.click(screen.getByLabelText('Start Reading'));

      expect(onUpdate).toHaveBeenCalledOnce();
      const updates = onUpdate.mock.calls[0][0];
      expect(updates.status).toBe('reading');
      expect(updates.startedReading).toBeDefined();
      expect(typeof updates.startedReading).toBe('string');
    });
  });

  /* ── Finish button ─────────────────────────────────────── */
  describe('Finish button', () => {
    it('shows Finish for reading books', () => {
      const book = makeBook({ status: 'reading' });
      render(<ReadingProgress book={book} onUpdate={vi.fn()} />);

      expect(screen.getByLabelText('Finish')).toBeInTheDocument();
    });

    it('hides Finish for read books', () => {
      const book = makeBook({ status: 'read' });
      render(<ReadingProgress book={book} onUpdate={vi.fn()} />);

      expect(screen.queryByLabelText('Finish')).not.toBeInTheDocument();
    });

    it('sets status to read, finishedReading, and full progress on click', () => {
      const onUpdate = vi.fn();
      const book = makeBook({ status: 'reading', pageCount: 328 });
      render(<ReadingProgress book={book} onUpdate={onUpdate} />);

      fireEvent.click(screen.getByLabelText('Finish'));

      expect(onUpdate).toHaveBeenCalledOnce();
      const updates = onUpdate.mock.calls[0][0];
      expect(updates.status).toBe('read');
      expect(updates.finishedReading).toBeDefined();
      expect(updates.progressPercent).toBe(100);
      expect(updates.pagesRead).toBe(328);
    });
  });

  /* ── Pages input ───────────────────────────────────────── */
  describe('pages input', () => {
    it('updates pagesRead and progressPercent on change', () => {
      const onUpdate = vi.fn();
      const book = makeBook({ pageCount: 328, pagesRead: 0 });
      render(<ReadingProgress book={book} onUpdate={onUpdate} />);

      const input = screen.getByLabelText('Pages read');
      fireEvent.change(input, { target: { value: '164' } });

      expect(onUpdate).toHaveBeenCalledOnce();
      const updates = onUpdate.mock.calls[0][0];
      expect(updates.pagesRead).toBe(164);
      expect(updates.progressPercent).toBe(50);
    });

    it('clamps pages to max pageCount', () => {
      const onUpdate = vi.fn();
      const book = makeBook({ pageCount: 100, pagesRead: 0 });
      render(<ReadingProgress book={book} onUpdate={onUpdate} />);

      const input = screen.getByLabelText('Pages read');
      fireEvent.change(input, { target: { value: '500' } });

      const updates = onUpdate.mock.calls[0][0];
      expect(updates.pagesRead).toBe(100);
      expect(updates.progressPercent).toBe(100);
    });
  });

  /* ── Star rating ───────────────────────────────────────── */
  describe('star rating', () => {
    it('renders 5 star buttons', () => {
      const book = makeBook();
      render(<ReadingProgress book={book} onUpdate={vi.fn()} />);

      for (let i = 1; i <= 5; i++) {
        expect(screen.getByLabelText(`Rate ${i} star${i > 1 ? 's' : ''}`)).toBeInTheDocument();
      }
    });

    it('calls onUpdate with rating when star is clicked', () => {
      const onUpdate = vi.fn();
      const book = makeBook();
      render(<ReadingProgress book={book} onUpdate={onUpdate} />);

      fireEvent.click(screen.getByLabelText('Rate 4 stars'));

      expect(onUpdate).toHaveBeenCalledWith({ rating: 4 });
    });

    it('toggles rating off when clicking same star', () => {
      const onUpdate = vi.fn();
      const book = makeBook({ rating: 4 });
      render(<ReadingProgress book={book} onUpdate={onUpdate} />);

      fireEvent.click(screen.getByLabelText('Rate 4 stars'));

      expect(onUpdate).toHaveBeenCalledWith({ rating: undefined });
    });

    it('changes rating when clicking a different star', () => {
      const onUpdate = vi.fn();
      const book = makeBook({ rating: 3 });
      render(<ReadingProgress book={book} onUpdate={onUpdate} />);

      fireEvent.click(screen.getByLabelText('Rate 5 stars'));

      expect(onUpdate).toHaveBeenCalledWith({ rating: 5 });
    });
  });

  /* ── Dates ─────────────────────────────────────────────── */
  describe('dates', () => {
    it('shows started date when set', () => {
      const book = makeBook({ startedReading: '2026-01-10T00:00:00.000Z' });
      render(<ReadingProgress book={book} onUpdate={vi.fn()} />);

      expect(screen.getByText(/Started:/)).toBeInTheDocument();
    });

    it('shows finished date when set', () => {
      const book = makeBook({ finishedReading: '2026-02-15T00:00:00.000Z' });
      render(<ReadingProgress book={book} onUpdate={vi.fn()} />);

      expect(screen.getByText(/Finished:/)).toBeInTheDocument();
    });

    it('hides dates section when no dates are set', () => {
      const book = makeBook();
      render(<ReadingProgress book={book} onUpdate={vi.fn()} />);

      expect(screen.queryByText(/Started:/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Finished:/)).not.toBeInTheDocument();
    });
  });
});
