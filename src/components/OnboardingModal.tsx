import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BookMarked, Check, X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';
import styles from './OnboardingModal.module.css';
import type { OnboardingStep } from './onboardingContent.tsx';

interface OnboardingModalProps {
  /** Whether the tour is currently visible. */
  open: boolean;
  /** Tour content; defaults to {@link DEFAULT_ONBOARDING_STEPS}. */
  steps: OnboardingStep[];
  /** Called whenever the modal should close (skip, escape, or complete). */
  onClose: () => void;
  /**
   * Optional override for the step shown on first render. Defaults to 0.
   * Mostly useful for tests; the modal otherwise manages its own step state.
   */
  initialStep?: number;
}

export default function OnboardingModal({
  open,
  steps,
  onClose,
  initialStep = 0,
}: OnboardingModalProps) {
  // Track the previous `open` value as state so we can reset the step on the
  // closed -> open transition without using an effect or a ref. This is the
  // "adjusting state during render" pattern; see
  // https://react.dev/learn/you-might-not-need-an-effect.
  const [prevOpen, setPrevOpen] = useState(open);
  const [currentStep, setCurrentStep] = useState(initialStep);
  const focusTrapRef = useFocusTrap<HTMLDivElement>();

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setCurrentStep(initialStep);
  }

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Escape key skips the tour.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, handleClose]);

  if (!open || steps.length === 0) return null;

  const safeStep = Math.min(Math.max(currentStep, 0), steps.length - 1);
  const step = steps[safeStep];
  const isFirst = safeStep === 0;
  const isLast = safeStep === steps.length - 1;

  const goBack = () => setCurrentStep((s) => Math.max(s - 1, 0));
  const goNext = () => setCurrentStep((s) => Math.min(s + 1, steps.length - 1));

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome tour"
    >
      <div ref={focusTrapRef} className={`glass ${styles.modal}`}>
        <button
          type="button"
          onClick={handleClose}
          className={styles.skipCorner}
          aria-label="Skip tour"
        >
          <X size={16} aria-hidden="true" />
          <span>Skip</span>
        </button>

        <div className={styles.progressRow}>
          <span className={styles.eyebrow}>
            <BookMarked size={14} aria-hidden="true" /> Quick tour
          </span>
          <span className={styles.progressText}>
            Step {safeStep + 1} of {steps.length}
          </span>
        </div>

        <div
          className={styles.dots}
          role="tablist"
          aria-label="Tour progress"
        >
          {steps.map((s, i) => (
            <span
              key={s.id}
              role="tab"
              aria-selected={i === safeStep}
              aria-label={`Step ${i + 1}: ${s.title}`}
              className={`${styles.dot} ${i === safeStep ? styles.dotActive : ''}`}
              style={i === safeStep ? { background: step.accent } : undefined}
            />
          ))}
        </div>

        <div className={styles.hero} style={{ borderColor: `${step.accent}55` }}>
          <div
            className={styles.iconBadge}
            style={{ background: `${step.accent}20`, color: step.accent }}
            aria-hidden="true"
          >
            {step.icon}
          </div>
          <div>
            <h2 id="onboarding-title" className={styles.title}>
              {step.title}
            </h2>
            <p className={styles.body}>{step.body}</p>
          </div>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            onClick={handleClose}
            className={styles.secondaryBtn}
          >
            Skip tour
          </button>
          <div className={styles.primaryGroup}>
            <button
              type="button"
              onClick={goBack}
              disabled={isFirst}
              className={styles.ghostBtn}
              aria-label="Previous step"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Back
            </button>
            {!isLast && step.onCta && step.ctaLabel && (
              <button
                type="button"
                onClick={() => {
                  step.onCta?.();
                  handleClose();
                }}
                className={styles.secondaryBtn}
              >
                {step.ctaLabel}
              </button>
            )}
            {isLast ? (
              <button
                type="button"
                onClick={handleClose}
                className={styles.primaryBtn}
              >
                Done
                <Check size={16} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                className={styles.primaryBtn}
              >
                Next
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
