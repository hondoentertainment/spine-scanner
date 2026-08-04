import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { useSwipeToDismiss } from '../useSwipeToDismiss';

function Sheet({
  onDismiss,
  isAtTop,
  threshold,
}: {
  onDismiss: () => void;
  isAtTop?: () => boolean;
  threshold?: number;
}) {
  const handlers = useSwipeToDismiss(onDismiss, { isAtTop, threshold });
  return <div data-testid="sheet" {...handlers} />;
}

const swipe = (el: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }) => {
  fireEvent.touchStart(el, { touches: [{ clientX: from.x, clientY: from.y }] });
  fireEvent.touchMove(el, { touches: [{ clientX: to.x, clientY: to.y }] });
  fireEvent.touchEnd(el);
};

describe('useSwipeToDismiss', () => {
  it('dismisses on a long downward swipe', () => {
    const onDismiss = vi.fn();
    render(<Sheet onDismiss={onDismiss} />);
    swipe(screen.getByTestId('sheet'), { x: 100, y: 100 }, { x: 105, y: 260 });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('ignores swipes shorter than the threshold', () => {
    const onDismiss = vi.fn();
    render(<Sheet onDismiss={onDismiss} threshold={90} />);
    swipe(screen.getByTestId('sheet'), { x: 100, y: 100 }, { x: 100, y: 150 });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('ignores upward swipes', () => {
    const onDismiss = vi.fn();
    render(<Sheet onDismiss={onDismiss} />);
    swipe(screen.getByTestId('sheet'), { x: 100, y: 300 }, { x: 100, y: 50 });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('ignores predominantly horizontal swipes', () => {
    const onDismiss = vi.fn();
    render(<Sheet onDismiss={onDismiss} />);
    swipe(screen.getByTestId('sheet'), { x: 20, y: 100 }, { x: 300, y: 220 });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('does not arm when the content is scrolled away from the top', () => {
    const onDismiss = vi.fn();
    render(<Sheet onDismiss={onDismiss} isAtTop={() => false} />);
    swipe(screen.getByTestId('sheet'), { x: 100, y: 100 }, { x: 100, y: 400 });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('arms again once the content is back at the top', () => {
    const onDismiss = vi.fn();
    let atTop = false;
    render(<Sheet onDismiss={onDismiss} isAtTop={() => atTop} />);
    const sheet = screen.getByTestId('sheet');
    swipe(sheet, { x: 100, y: 100 }, { x: 100, y: 400 });
    atTop = true;
    swipe(sheet, { x: 100, y: 100 }, { x: 100, y: 400 });
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
