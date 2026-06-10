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

  it('reads stored high-contrast preference from profile store', () => {
    useProfileStore.setState({ preferences: { ...useProfileStore.getState().preferences, theme: 'high-contrast' } });
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('high-contrast');
  });

  it('resolves system preference to dark by default', () => {
    useProfileStore.setState({ preferences: { ...useProfileStore.getState().preferences, theme: 'system' } });
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('toggle cycles light → dark → system → high-contrast → light', () => {
    useProfileStore.setState({ preferences: { ...useProfileStore.getState().preferences, theme: 'light' } });
    const { result } = renderHook(() => useTheme());

    expect(result.current.themePreference).toBe('light');

    act(() => result.current.toggleTheme());
    expect(useProfileStore.getState().preferences.theme).toBe('dark');

    act(() => result.current.toggleTheme());
    expect(useProfileStore.getState().preferences.theme).toBe('system');

    act(() => result.current.toggleTheme());
    expect(useProfileStore.getState().preferences.theme).toBe('high-contrast');

    act(() => result.current.toggleTheme());
    expect(useProfileStore.getState().preferences.theme).toBe('light');
  });

  it('persists to localStorage via zustand persist', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggleTheme());
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    expect(stored.state?.preferences?.theme).toBeTruthy();
  });

  it('sets data-theme attribute on document element', () => {
    const { result } = renderHook(() => useTheme());
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    act(() => result.current.setTheme('light'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('sets data-theme to "high-contrast" when high-contrast is selected', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('high-contrast'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('high-contrast');
  });

  it('setTheme applies the given theme', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('light'));
    expect(result.current.theme).toBe('light');
    expect(useProfileStore.getState().preferences.theme).toBe('light');

    act(() => result.current.setTheme('system'));
    expect(result.current.themePreference).toBe('system');

    act(() => result.current.setTheme('high-contrast'));
    expect(result.current.themePreference).toBe('high-contrast');
    expect(result.current.theme).toBe('high-contrast');
  });
});
