import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ShelfScanReview from '../ShelfScanReview.tsx';
import { shelfItemsToBooks } from '../../shelf/reviewImport.ts';
import type { ShelfReviewItem } from '../../shelf/types.ts';

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

describe('ShelfScanReview', () => {
  it('edits and rejects books, then imports only the accepted rows', () => {
    const onChange = vi.fn();
    const onConfirm = vi.fn();
    const view = render(
      <ShelfScanReview items={items} onChange={onChange} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );

    expect(screen.getByRole('heading', { name: 'Review shelf scan' })).toBeInTheDocument();
    expect(screen.getByTestId('shelf-import-btn')).toHaveTextContent('Add 1 book');

    fireEvent.change(screen.getAllByLabelText('Title')[0], { target: { value: 'Kindred: A Novel' } });
    const edited = onChange.mock.calls[0][0] as ShelfReviewItem[];
    expect(edited[0].title).toBe('Kindred: A Novel');

    view.rerender(
      <ShelfScanReview items={edited} onChange={onChange} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
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
});
