import { type RefObject, useLayoutEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function runFocusTrap(active: boolean, rootRef: RefObject<HTMLElement | null>): (() => void) | void {
  if (!active || !rootRef.current) return;

  const root = rootRef.current;
  const previous = document.activeElement as HTMLElement | null;

  const getFocusable = (): HTMLElement[] =>
    [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );

  const focusables = getFocusable();
  focusables[0]?.focus();

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const list = getFocusable();
    if (list.length === 0) return;
    const first = list[0];
    const last = list[list.length - 1];
    const current = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (current === first || !root.contains(current)) {
        e.preventDefault();
        last.focus();
      }
    } else if (current === last) {
      e.preventDefault();
      first.focus();
    }
  };

  document.addEventListener('keydown', onKeyDown, true);
  return () => {
    document.removeEventListener('keydown', onKeyDown, true);
    if (previous && typeof previous.focus === 'function' && document.body.contains(previous)) {
      previous.focus();
    }
  };
}

/**
 * Keeps focus inside `rootRef` while `active` is true (Tab / Shift+Tab wrap).
 */
export function useFocusTrapEffect(active: boolean, rootRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const cleanup = runFocusTrap(active, rootRef);
    if (typeof cleanup === 'function') return cleanup;
    return undefined;
  }, [active, rootRef]);
}

/**
 * Returns a ref and traps focus whenever the ref is mounted (detail panels, always-on modals).
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useFocusTrapEffect(true, ref);
  return ref;
}
