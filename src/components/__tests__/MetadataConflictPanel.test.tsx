import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MetadataConflictPanel from '../MetadataConflictPanel.tsx';
import type { BookEntry } from '../../types.ts';

const conflictBook = (): BookEntry => ({
  id: 'book-1',
  isbn: '9780141036144',
  title: 'Current Title',
  author: 'Current Author',
  pageCount: 300,
  amazonLink: '',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: new Date().toISOString(),
  shelfIds: [],
  metadataSource: 'google_books',
  metadataPeers: {
    google: { title: 'Google Title', author: 'Author A', pageCount: 300 },
    openLibrary: { title: 'OL Title', author: 'Author B', pageCount: 320 },
  },
});

describe('MetadataConflictPanel', () => {
  it('renders nothing when peers are missing', () => {
    const { container } = render(
      <MetadataConflictPanel book={{ ...conflictBook(), metadataPeers: undefined }} onResolve={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows provider choices and resolves with selected snapshot', () => {
    const onResolve = vi.fn();
    render(<MetadataConflictPanel book={conflictBook()} onResolve={onResolve} />);

    expect(screen.getByRole('heading', { name: /providers disagree/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /use open library metadata/i }));

    expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({
      title: 'OL Title',
      author: 'Author B',
      metadataSource: 'open_library',
      needsReview: false,
    }));
  });

  it('marks the active metadata source as pressed', () => {
    render(<MetadataConflictPanel book={conflictBook()} onResolve={vi.fn()} />);
    expect(screen.getByRole('button', { name: /use google books metadata/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /use open library metadata/i })).toHaveAttribute('aria-pressed', 'false');
  });
});
