import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SmartShelfEditor from '../SmartShelfEditor';
import { useBookStore } from '../../store/useBookStore';
import type { BookEntry } from '../../types';

/* ================================================================
 *  Helpers
 * ================================================================ */

const makeBook = (overrides: Partial<BookEntry> = {}): BookEntry => ({
  id: 'b1',
  isbn: '978-0-13-468599-1',
  title: 'The Great Gatsby',
  author: 'F. Scott Fitzgerald',
  pageCount: 180,
  amazonLink: '',
  coverImg: '',
  status: 'reading',
  notes: '',
  dateAdded: '2025-12-01T10:00:00.000Z',
  shelfIds: [],
  ...overrides,
});

const noop = () => {};

/* ================================================================
 *  Tests
 * ================================================================ */

describe('SmartShelfEditor', () => {
  beforeEach(() => {
    useBookStore.setState({
      books: [
        makeBook({ id: 'b1', status: 'reading', pageCount: 500 }),
        makeBook({ id: 'b2', status: 'read', pageCount: 180 }),
        makeBook({ id: 'b3', status: 'dnf', pageCount: 300 }),
      ],
      shelves: [],
      smartShelves: [],
    });
  });

  /* ── Rendering ─────────────────────────────────────────── */
  describe('rendering', () => {
    it('renders the editor with title for new shelf', () => {
      render(<SmartShelfEditor onClose={noop} />);
      expect(screen.getByText('New Smart Shelf')).toBeInTheDocument();
    });

    it('renders the editor with title for editing existing shelf', () => {
      const shelf = { id: 'ss1', name: 'My Shelf', color: '#a855f7', rules: [] };
      render(<SmartShelfEditor shelf={shelf} onClose={noop} />);
      expect(screen.getByText('Edit Smart Shelf')).toBeInTheDocument();
    });

    it('shows name input', () => {
      render(<SmartShelfEditor onClose={noop} />);
      expect(screen.getByTestId('smart-shelf-name')).toBeInTheDocument();
    });

    it('pre-fills name and rules when editing', () => {
      const shelf = {
        id: 'ss1',
        name: 'My Shelf',
        color: '#a855f7',
        rules: [{ field: 'status' as const, operator: 'equals' as const, value: 'reading' }],
      };
      render(<SmartShelfEditor shelf={shelf} onClose={noop} />);
      expect(screen.getByTestId('smart-shelf-name')).toHaveValue('My Shelf');
      expect(screen.getByTestId('rule-row-0')).toBeInTheDocument();
    });

    it('shows matching books count', () => {
      render(<SmartShelfEditor onClose={noop} />);
      // With no rules, all books match
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('shows template buttons', () => {
      render(<SmartShelfEditor onClose={noop} />);
      expect(screen.getByTestId('template-Currently Reading')).toBeInTheDocument();
      expect(screen.getByTestId('template-Unfinished')).toBeInTheDocument();
    });
  });

  /* ── Adding rules ──────────────────────────────────────── */
  describe('adding rules', () => {
    it('adds a rule when Add Rule is clicked', () => {
      render(<SmartShelfEditor onClose={noop} />);

      expect(screen.queryByTestId('rule-row-0')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('add-rule-btn'));

      expect(screen.getByTestId('rule-row-0')).toBeInTheDocument();
    });

    it('adds multiple rules', () => {
      render(<SmartShelfEditor onClose={noop} />);

      fireEvent.click(screen.getByTestId('add-rule-btn'));
      fireEvent.click(screen.getByTestId('add-rule-btn'));

      expect(screen.getByTestId('rule-row-0')).toBeInTheDocument();
      expect(screen.getByTestId('rule-row-1')).toBeInTheDocument();
    });
  });

  /* ── Removing rules ────────────────────────────────────── */
  describe('removing rules', () => {
    it('removes a rule when remove button is clicked', () => {
      const shelf = {
        id: 'ss1',
        name: 'Test',
        color: '#ccc',
        rules: [
          { field: 'status' as const, operator: 'equals' as const, value: 'read' },
          { field: 'pageCount' as const, operator: 'greaterThan' as const, value: '300' },
        ],
      };
      render(<SmartShelfEditor shelf={shelf} onClose={noop} />);

      expect(screen.getByTestId('rule-row-0')).toBeInTheDocument();
      expect(screen.getByTestId('rule-row-1')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('remove-rule-0'));

      // Only one rule should remain
      expect(screen.getByTestId('rule-row-0')).toBeInTheDocument();
      expect(screen.queryByTestId('rule-row-1')).not.toBeInTheDocument();
    });
  });

  /* ── Template selection ────────────────────────────────── */
  describe('template selection', () => {
    it('fills name, color, and rules from template', () => {
      render(<SmartShelfEditor onClose={noop} />);

      fireEvent.click(screen.getByTestId('template-Currently Reading'));

      expect(screen.getByTestId('smart-shelf-name')).toHaveValue('Currently Reading');
      expect(screen.getByTestId('rule-row-0')).toBeInTheDocument();
    });

    it('applies Unfinished template', () => {
      render(<SmartShelfEditor onClose={noop} />);

      fireEvent.click(screen.getByTestId('template-Unfinished'));

      expect(screen.getByTestId('smart-shelf-name')).toHaveValue('Unfinished');
    });
  });

  /* ── Save ──────────────────────────────────────────────── */
  describe('save', () => {
    it('creates a new smart shelf in store on save', () => {
      const onClose = vi.fn();
      render(<SmartShelfEditor onClose={onClose} />);

      fireEvent.change(screen.getByTestId('smart-shelf-name'), {
        target: { value: 'My Smart Shelf' },
      });
      fireEvent.click(screen.getByTestId('add-rule-btn'));

      // Set rule value
      const valueInputs = screen.getAllByLabelText('Rule value');
      fireEvent.change(valueInputs[0], { target: { value: 'reading' } });

      fireEvent.click(screen.getByTestId('save-smart-shelf'));

      const smartShelves = useBookStore.getState().smartShelves;
      expect(smartShelves).toHaveLength(1);
      expect(smartShelves[0].name).toBe('My Smart Shelf');
      expect(smartShelves[0].rules).toHaveLength(1);
      expect(onClose).toHaveBeenCalled();
    });

    it('updates existing smart shelf on save', () => {
      const existing = {
        id: 'ss1',
        name: 'Old Name',
        color: '#a855f7',
        rules: [{ field: 'status' as const, operator: 'equals' as const, value: 'reading' }],
      };
      useBookStore.setState({ smartShelves: [existing] });

      const onClose = vi.fn();
      render(<SmartShelfEditor shelf={existing} onClose={onClose} />);

      fireEvent.change(screen.getByTestId('smart-shelf-name'), {
        target: { value: 'New Name' },
      });

      fireEvent.click(screen.getByTestId('save-smart-shelf'));

      const smartShelves = useBookStore.getState().smartShelves;
      expect(smartShelves).toHaveLength(1);
      expect(smartShelves[0].name).toBe('New Name');
      expect(onClose).toHaveBeenCalled();
    });

    it('does not save with empty name', () => {
      render(<SmartShelfEditor onClose={noop} />);

      // Name is empty by default; save button should be disabled
      const saveBtn = screen.getByTestId('save-smart-shelf');
      expect(saveBtn).toBeDisabled();
    });
  });

  /* ── Close ─────────────────────────────────────────────── */
  describe('close', () => {
    it('calls onClose when Cancel is clicked', () => {
      const onClose = vi.fn();
      render(<SmartShelfEditor onClose={onClose} />);
      fireEvent.click(screen.getByText('Cancel'));
      expect(onClose).toHaveBeenCalled();
    });

    it('calls onClose when overlay is clicked', () => {
      const onClose = vi.fn();
      render(<SmartShelfEditor onClose={onClose} />);
      fireEvent.click(screen.getByTestId('smart-shelf-editor-overlay'));
      expect(onClose).toHaveBeenCalled();
    });
  });
});
