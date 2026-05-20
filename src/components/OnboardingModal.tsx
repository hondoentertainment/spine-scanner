import { useEffect } from 'react';
import { ArrowRight, BookMarked } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';
import styles from './OnboardingModal.module.css';
import type { OnboardingStep } from './onboardingContent.tsx';

interface OnboardingModalProps {
  currentStep: number;
  steps: OnboardingStep[];
  onNext: () => void;
  onSkip: () => void;
  onComplete: () => void;
}

export default function OnboardingModal({
  currentStep,
  steps,
  onNext,
  onSkip,
  onComplete,
}: OnboardingModalProps) {
  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;
  const modalRef = useFocusTrap<HTMLDivElement>(Boolean(step));

  useEffect(() => {
    if (!step) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onSkip();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onSkip, step]);

  if (!step) return null;

  return (
    <div className={styles.overlay}>
      <div
        ref={modalRef}
        className={`glass ${styles.modal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-body"
      >
        <div className={styles.progressRow}>
          <span className={styles.eyebrow}><BookMarked size={14} /> Quick tour</span>
          <span className={styles.progressText}>Step {currentStep + 1} of {steps.length}</span>
        </div>

        <div className={styles.progressBar} aria-hidden="true">
          <span className={styles.progressFill} style={{ width: `${((currentStep + 1) / steps.length) * 100}%`, background: step.accent }} />
        </div>

        <div className={styles.hero} style={{ borderColor: `${step.accent}55` }}>
          <div className={styles.iconBadge} style={{ background: `${step.accent}20`, color: step.accent }}>
            {step.icon}
          </div>
          <div>
            <h2 id="onboarding-title" className={styles.title}>{step.title}</h2>
            <p id="onboarding-body" className={styles.body}>{step.body}</p>
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" onClick={onSkip} className={styles.secondaryBtn}>Skip tour</button>
          <div className={styles.primaryGroup}>
            {step.onCta && step.ctaLabel && (
              <button type="button" onClick={step.onCta} className={styles.secondaryBtn}>
                {step.ctaLabel}
              </button>
            )}
            <button type="button" onClick={isLast ? onComplete : onNext} className={styles.primaryBtn}>
              {isLast ? 'Finish setup' : 'Next'}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
