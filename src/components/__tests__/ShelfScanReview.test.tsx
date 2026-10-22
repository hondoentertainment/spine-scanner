import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ShelfScanReview from '../ShelfScanReview.tsx';
import { shelfItemsToBooks } from '../../shelf/reviewImport.ts';
import type { ShelfMetadataHit, ShelfReviewItem } from '../../shelf/types.ts';

const items: ShelfReviewItem[] = [
  {
    id: 'spine-1-1',
    title: 'Kindred',
    author: 'Octavia Butler',
    isbn: '9780807083697',
    pageCount: 264,
    coverImg: '',
    previewUrl: '',
    confidence: 0.91,
    decision: 'accept',
    metadataSource: 'open_library',
    detectionMethod: 'ocr',
    needsReview: false,
    reviewReason: '',
    rawText: 'Kindred',
  },
  {
    id: 'spine-1-2',
    title: 'Unknown Title',
    author: 'Unknown Author',
    isbn: '',
    pageCount: 0,
    coverImg: '',
    previewUrl: '',
    confidence: 0.4,
    decision: 'reject',
    metadataSource: 'manual',
    detectionMethod: 'ocr',
    needsReview: true,
    reviewReason: 'No ISBN detected. Confirm the title and author, or reject this spine.',
    rawText: '',
  },
];

const replacement: ShelfMetadataHit = {
  title: 'Parable of the Sower',
  author: 'Octavia E. Butler',
  isbn: '9780446675505',
  pageCount: 345,
  thumbnail: 'https://covers.example/sower.jpg',
  source: 'google_books',
};

describe('ShelfScanReview', () => {
  it('keeps, edits, and skips books, then adds only the kept rows', () => {
    const onChange = vi.fn();
    const onConfirm = vi.fn();
    const view = render(
      <ShelfScanReview items={items} onChange={onChange} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );

    expect(screen.getByRole('heading', { name: 'Check these books' })).toBeInTheDocument();
    expect(screen.getByText('Looks right')).toBeInTheDocument();
    expect(screen.getByText(/No ISBN detected/)).toBeInTheDocument();
    expect(screen.getByText('1 kept · 1 skipped')).toBeInTheDocument();
    const add = screen.getByTestId('shelf-import-btn');
    expect(add).toHaveTextContent('Add all kept');
    expect(add).toHaveAccessibleName('Add all kept, 1 book');
    expect(add).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Kindred' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Kindred: A Novel' } });
    const edited = onChange.mock.calls[0][0] as ShelfReviewItem[];
    expect(edited[0].title).toBe('Kindred: A Novel');

    view.rerender(
      <ShelfScanReview items={edited} onChange={onChange} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip Kindred: A Novel' }));
    const rejected = onChange.mock.calls[1][0] as ShelfReviewItem[];
    expect(rejected[0].decision).toBe('reject');

    view.rerender(
      <ShelfScanReview items={rejected} onChange={onChange} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    expect(screen.getByTestId('shelf-import-btn')).toBeDisabled();

    const restored = rejected.map((item, index) => (
      index === 0 ? { ...item, decision: 'accept' as const } : item
    ));
    view.rerender(
      <ShelfScanReview items={restored} onChange={onChange} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Keep Unknown Title' }));
    const bothKept = onChange.mock.calls[2][0] as ShelfReviewItem[];
    expect(bothKept[1].decision).toBe('accept');

    view.rerender(
      <ShelfScanReview items={restored} onChange={onChange} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId('shelf-import-btn'));
    expect(onConfirm).toHaveBeenCalledWith(restored);

    const { books } = shelfItemsToBooks(restored, [], {
      now: '2026-10-12T00:00:00.000Z',
      createId: () => 'imported-1',
    });
    expect(books).toHaveLength(1);
    expect(books[0]).toMatchObject({
      title: 'Kindred: A Novel',
      author: 'Octavia Butler',
      isbn: '9780807083697',
    });
  });

  it('replaces a wrong match from search results', async () => {
    const onChange = vi.fn();
    const searchMatches = vi.fn(async () => [replacement]);
    render(
      <ShelfScanReview
        items={items}
        onChange={onChange}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        searchMatches={searchMatches}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Kindred' }));
    fireEvent.click(screen.getByRole('button', { name: 'Find a different match' }));
    const useMatch = await screen.findByRole('button', { name: 'Use Parable of the Sower by Octavia E. Butler' });
    fireEvent.click(useMatch);

    expect(searchMatches).toHaveBeenCalledWith('Kindred Octavia Butler');
    const next = onChange.mock.calls.at(-1)?.[0] as ShelfReviewItem[];
    expect(next[0]).toMatchObject({
      title: 'Parable of the Sower',
      author: 'Octavia E. Butler',
      isbn: '9780446675505',
      coverImg: 'https://covers.example/sower.jpg',
      decision: 'accept',
      confidence: 0.92,
      metadataSource: 'google_books',
    });
    expect(await screen.findByText('Match updated.')).toBeInTheDocument();
  });
});
