import { useRef } from 'react';
import type React from 'react';

interface SwipeToDismissOptions {
  /** Minimum downward travel in px before the gesture dismisses. */
  threshold?: number;
  /**
   * The gesture only arms when this returns true at touch start — pass a
   * check that the modal's scroll body is at the top so swiping down while
   * reading scrolled content never closes the modal.
   */
  isAtTop?: () => boolean;
}

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
}

/**
 * Swipe-down-to-dismiss for modal sheets on touch devices. Dismisses when a
 * predominantly vertical downward swipe travels past `threshold` px and the
 * scrollable content was at the top when the gesture began.
 */
export function useSwipeToDismiss(
  onDismiss: () => void,
  { threshold = 90, isAtTop }: SwipeToDismissOptions = {},
): SwipeHandlers {
  const startRef = useRef<{ x: number; y: number; armed: boolean } | null>(null);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    startRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      armed: isAtTop ? isAtTop() : true,
    };
    lastRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch || !startRef.current) return;
    lastRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = () => {
    const start = startRef.current;
    const last = lastRef.current;
    startRef.current = null;
    lastRef.current = null;
    if (!start || !last || !start.armed) return;

    const deltaY = last.y - start.y;
    const deltaX = Math.abs(last.x - start.x);
    if (deltaY >= threshold && deltaY > deltaX * 1.5) {
      onDismiss();
    }
  };

  return { onTouchStart, onTouchMove, onTouchEnd };
}
