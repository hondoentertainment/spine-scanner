import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnlineStatus } from '../useOnlineStatus';

describe('useOnlineStatus', () => {
  beforeEach(() => {
    // Reset navigator.onLine to true before each test
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  it('returns online = true when navigator.onLine is true', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.online).toBe(true);
  });

  it('returns online = false when navigator.onLine is false', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.online).toBe(false);
  });

  it('starts with justReconnected = false', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.justReconnected).toBe(false);
  });

  it('sets online = false when offline event fires', () => {
    const { result } = renderHook(() => useOnlineStatus());

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current.online).toBe(false);
  });

  it('sets online = true when online event fires', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
    const { result } = renderHook(() => useOnlineStatus());

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current.online).toBe(true);
  });

  it('sets justReconnected = true on offline -> online transition', () => {
    const { result } = renderHook(() => useOnlineStatus());

    // Go offline
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.justReconnected).toBe(false);

    // Come back online
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.justReconnected).toBe(true);
  });

  it('clearReconnected resets justReconnected to false', () => {
    const { result } = renderHook(() => useOnlineStatus());

    // Go offline then online
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.justReconnected).toBe(true);

    // Clear it
    act(() => {
      result.current.clearReconnected();
    });
    expect(result.current.justReconnected).toBe(false);
  });

  it('cleans up event listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useOnlineStatus());

    unmount();

    const removedEvents = removeSpy.mock.calls.map((call) => call[0]);
    expect(removedEvents).toContain('online');
    expect(removedEvents).toContain('offline');
    removeSpy.mockRestore();
  });
});
