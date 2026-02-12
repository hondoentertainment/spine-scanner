import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from '../useTheme';

const STORAGE_KEY = 'spine-scanner-theme';

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to dark when no stored preference', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('reads stored light preference from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
  });

  it('reads stored dark preference from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('ignores invalid stored values and defaults to dark', () => {
    localStorage.setItem(STORAGE_KEY, 'invalid-value');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('toggles from dark to light', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('light');
  });

  it('toggles from light back to dark', () => {
    localStorage.setItem(STORAGE_KEY, 'light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('persists theme to localStorage on change', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggleTheme());
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');

    act(() => result.current.toggleTheme());
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
  });

  it('sets data-theme attribute on document element', () => {
    const { result } = renderHook(() => useTheme());
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    act(() => result.current.toggleTheme());
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('gracefully handles localStorage.getItem throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');

    vi.restoreAllMocks();
  });

  it('gracefully handles localStorage.setItem throwing', () => {
    const { result } = renderHook(() => useTheme());

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });

    // Should not throw even if localStorage fails
    expect(() => {
      act(() => result.current.toggleTheme());
    }).not.toThrow();

    expect(result.current.theme).toBe('light');

    vi.restoreAllMocks();
  });
});
