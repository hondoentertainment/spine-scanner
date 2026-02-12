import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ThemeToggle from '../ThemeToggle';

describe('ThemeToggle', () => {
  it('renders without crashing', () => {
    render(<ThemeToggle theme="dark" onToggle={vi.fn()} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('has correct aria-label for dark mode', () => {
    render(<ThemeToggle theme="dark" onToggle={vi.fn()} />);
    expect(screen.getByLabelText('Switch to light mode')).toBeInTheDocument();
  });

  it('has correct aria-label for light mode', () => {
    render(<ThemeToggle theme="light" onToggle={vi.fn()} />);
    expect(screen.getByLabelText('Switch to dark mode')).toBeInTheDocument();
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<ThemeToggle theme="dark" onToggle={onToggle} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('has correct title for dark mode', () => {
    render(<ThemeToggle theme="dark" onToggle={vi.fn()} />);
    expect(screen.getByTitle('Switch to light mode')).toBeInTheDocument();
  });

  it('has correct title for light mode', () => {
    render(<ThemeToggle theme="light" onToggle={vi.fn()} />);
    expect(screen.getByTitle('Switch to dark mode')).toBeInTheDocument();
  });
});
