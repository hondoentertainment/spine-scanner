import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from '../useTheme';
import { useProfileStore } from '../../store/useProfileStore';

const PREFS_KEY = 'spine-scanner-preferences';

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    useProfileStore.setState({ preferences: { ...useProfileStore.getState().preferences, theme: 'dark' } });
  });

  it('defaults to dark when no stored preference', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('reads stored light preference from profile store', () => {
    useProfileStore.setState({ preferences: { ...useProfileStore.getState().preferences, theme: 'light' } });
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
  });

  it('reads stored dark preference from profile store', () => {
    useProfileStore.setState({ preferences: { ...useProfileStore.getState().preferences, theme: 'dark' } });
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('resolves system preference to dark by default', () => {
    useProfileStore.setState({ preferences: { ...useProfileStore.getState().preferences, theme: 'system' } });
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
    useProfileStore.setState({ preferences: { ...useProfileStore.getState().preferences, theme: 'light' } });
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('persists theme to profile store on change', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggleTheme());
    expect(useProfileStore.getState().preferences.theme).toBe('light');

    act(() => result.current.toggleTheme());
    expect(useProfileStore.getState().preferences.theme).toBe('dark');
  });

  it('persists to localStorage via zustand persist', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggleTheme());
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    expect(stored.state?.preferences?.theme).toBe('light');
  });

  it('sets data-theme attribute on document element', () => {
    const { result } = renderHook(() => useTheme());
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    act(() => result.current.toggleTheme());
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('setTheme applies the given theme', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('light'));
    expect(result.current.theme).toBe('light');
    expect(useProfileStore.getState().preferences.theme).toBe('light');

    act(() => result.current.setTheme('system'));
    expect(result.current.themePreference).toBe('system');
  });
});
