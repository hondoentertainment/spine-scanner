import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PwaInstallPrompt from '../PwaInstallPrompt';

describe('PwaInstallPrompt', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('stays dismissed after Not now, including on the next visit', () => {
    const event = new Event('beforeinstallprompt');
    Object.assign(event, { prompt: () => Promise.resolve(), userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    render(<PwaInstallPrompt />);
    fireEvent(window, event);
    expect(screen.getByRole('region', { name: 'Install app' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('region', { name: 'Install app' })).not.toBeInTheDocument();
    expect(localStorage.getItem('spine-pwa-install-dismissed')).toBe('1');

    render(<PwaInstallPrompt />);
    fireEvent(window, event);
    expect(screen.queryByRole('region', { name: 'Install app' })).not.toBeInTheDocument();
  });
});
