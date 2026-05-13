import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act, cleanup } from '@testing-library/react';
import ThemeToggle from '../ThemeToggle';
import { useTheme } from '../../hooks/useTheme';
import { useProfileStore } from '../../store/useProfileStore';

describe('ThemeToggle', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    useProfileStore.setState({
      preferences: { ...useProfileStore.getState().preferences, theme: 'dark' },
    });
  });

  it('renders without crashing', () => {
    render(<ThemeToggle themePreference="dark" onToggle={vi.fn()} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('announces the current theme and the next step for dark', () => {
    render(<ThemeToggle themePreference="dark" onToggle={vi.fn()} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-label', expect.stringContaining('Dark'));
    expect(btn).toHaveAttribute('aria-label', expect.stringContaining('system'));
  });

  it('announces the current theme and the next step for light', () => {
    render(<ThemeToggle themePreference="light" onToggle={vi.fn()} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-label', expect.stringContaining('Light'));
    expect(btn).toHaveAttribute('aria-label', expect.stringContaining('dark'));
  });

  it('announces the current theme and the next step for system', () => {
    render(<ThemeToggle themePreference="system" onToggle={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('high contrast'),
    );
  });

  it('announces the current theme and the next step for high-contrast', () => {
    render(<ThemeToggle themePreference="high-contrast" onToggle={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('High contrast'),
    );
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<ThemeToggle themePreference="dark" onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('exposes a title that mirrors the aria-label', () => {
    render(<ThemeToggle themePreference="dark" onToggle={vi.fn()} />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('title')).toBe(btn.getAttribute('aria-label'));
  });

  it('cycles through all 4 themes via useTheme.toggleTheme', () => {
    useProfileStore.setState({
      preferences: { ...useProfileStore.getState().preferences, theme: 'light' },
    });
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

  it('updates data-theme on documentElement when theme changes', () => {
    const { result } = renderHook(() => useTheme());
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    act(() => result.current.setTheme('light'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    act(() => result.current.setTheme('high-contrast'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('high-contrast');
  });
});
