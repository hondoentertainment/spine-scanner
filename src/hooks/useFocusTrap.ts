import { useEffect, useRef } from 'react';

/**
 * Traps focus within the referenced element while it is mounted.
 * When the trap activates, the previously-focused element is saved
 * and focus moves into the container. On unmount, focus is restored.
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>() {
    const containerRef = useRef<T>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Save previously focused element so we can restore it on close
        previousFocusRef.current = document.activeElement as HTMLElement | null;

        // Focus the first focusable element inside the trap
        const focusFirst = () => {
            const focusable = getFocusableElements(container);
            if (focusable.length > 0) {
                focusable[0].focus();
            } else {
                // If nothing focusable, make the container itself focusable
                container.setAttribute('tabindex', '-1');
                container.focus();
            }
        };

        // Small delay to let React finish rendering
        const timer = setTimeout(focusFirst, 0);

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;

            const focusable = getFocusableElements(container);
            if (focusable.length === 0) return;

            const firstEl = focusable[0];
            const lastEl = focusable[focusable.length - 1];

            if (e.shiftKey) {
                // Shift+Tab: wrap from first to last
                if (document.activeElement === firstEl) {
                    e.preventDefault();
                    lastEl.focus();
                }
            } else {
                // Tab: wrap from last to first
                if (document.activeElement === lastEl) {
                    e.preventDefault();
                    firstEl.focus();
                }
            }
        };

        container.addEventListener('keydown', handleKeyDown);

        return () => {
            clearTimeout(timer);
            container.removeEventListener('keydown', handleKeyDown);

            // Restore focus to the element that was focused before the trap
            if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
                previousFocusRef.current.focus();
            }
        };
    }, []);

    return containerRef;
}

/** Get all focusable elements within a container, in DOM order. */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
    const selector = [
        'a[href]',
        'button:not([disabled])',
        'textarea:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
    ].join(', ');

    return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => !el.closest('[aria-hidden="true"]') && el.offsetParent !== null
    );
}
