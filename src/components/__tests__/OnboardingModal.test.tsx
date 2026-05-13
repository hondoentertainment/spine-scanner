import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingModal from '../OnboardingModal';
import { DEFAULT_ONBOARDING_STEPS } from '../onboardingContent';

// Avoid focus-trap side effects in jsdom (it tries to focus elements).
vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}));

describe('OnboardingModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when open is false (matches preferences.onboardingCompleted === true)', () => {
    const onClose = vi.fn();
    const { container } = render(
      <OnboardingModal open={false} steps={DEFAULT_ONBOARDING_STEPS} onClose={onClose} />
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the first step on initial open', () => {
    render(
      <OnboardingModal open steps={DEFAULT_ONBOARDING_STEPS} onClose={vi.fn()} />
    );
    expect(screen.getByRole('dialog', { name: /welcome tour/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /welcome to spinescanner/i })).toBeInTheDocument();
    expect(screen.getByText(/step 1 of 4/i)).toBeInTheDocument();
  });

  it('Next button advances through all four steps', async () => {
    const user = userEvent.setup();
    render(
      <OnboardingModal open steps={DEFAULT_ONBOARDING_STEPS} onClose={vi.fn()} />
    );

    // Step 1 -> 2
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByText(/step 2 of 4/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /point your camera at a barcode/i })).toBeInTheDocument();

    // Step 2 -> 3
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByText(/step 3 of 4/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /track your reading/i })).toBeInTheDocument();

    // Step 3 -> 4
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByText(/step 4 of 4/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /sync across devices/i })).toBeInTheDocument();

    // Step 4 shows Done, not Next
    expect(screen.queryByRole('button', { name: /^next$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^done$/i })).toBeInTheDocument();
  });

  it('Back button is disabled on step 1 and navigates backwards otherwise', async () => {
    const user = userEvent.setup();
    render(
      <OnboardingModal open steps={DEFAULT_ONBOARDING_STEPS} onClose={vi.fn()} />
    );

    const backBtn = screen.getByRole('button', { name: /previous step/i });
    expect(backBtn).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByText(/step 2 of 4/i)).toBeInTheDocument();

    const backBtn2 = screen.getByRole('button', { name: /previous step/i });
    expect(backBtn2).toBeEnabled();
    await user.click(backBtn2);
    expect(screen.getByText(/step 1 of 4/i)).toBeInTheDocument();
  });

  it('Done button on step 4 calls onClose (which marks preferences complete)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <OnboardingModal open steps={DEFAULT_ONBOARDING_STEPS} onClose={onClose} initialStep={3} />
    );

    expect(screen.getByText(/step 4 of 4/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Skip button closes the tour at any step', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <OnboardingModal open steps={DEFAULT_ONBOARDING_STEPS} onClose={onClose} initialStep={1} />
    );

    // Both the top-right corner button and the footer button label as "Skip tour".
    const skipButtons = screen.getAllByRole('button', { name: /skip tour/i });
    expect(skipButtons.length).toBeGreaterThanOrEqual(2);
    await user.click(skipButtons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Skip tour footer button also closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <OnboardingModal open steps={DEFAULT_ONBOARDING_STEPS} onClose={onClose} />
    );

    const skipButtons = screen.getAllByRole('button', { name: /skip tour/i });
    expect(skipButtons.length).toBeGreaterThanOrEqual(1);
    await user.click(skipButtons[skipButtons.length - 1]);
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape key skips the tour', () => {
    const onClose = vi.fn();
    render(
      <OnboardingModal open steps={DEFAULT_ONBOARDING_STEPS} onClose={onClose} />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders a step indicator (dot) for each step', () => {
    render(
      <OnboardingModal open steps={DEFAULT_ONBOARDING_STEPS} onClose={vi.fn()} />
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(DEFAULT_ONBOARDING_STEPS.length);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('invokes the per-step CTA when present and then closes', async () => {
    const user = userEvent.setup();
    const onCta = vi.fn();
    const onClose = vi.fn();
    const stepsWithCta = DEFAULT_ONBOARDING_STEPS.map((s) =>
      s.id === 'scan' ? { ...s, onCta, ctaLabel: 'Open scanner' } : s
    );

    render(
      <OnboardingModal open steps={stepsWithCta} onClose={onClose} initialStep={1} />
    );

    await user.click(screen.getByRole('button', { name: /open scanner/i }));
    expect(onCta).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
